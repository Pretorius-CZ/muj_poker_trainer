import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDecision,
  exploitVerdict,
  gradeDecision,
  reviewHand,
  riskVerdict,
} from "../app/review.js";

/** Rozhodnutí, kdy soupeř vsadil 50 do potu 100. */
function facingBet(overrides = {}) {
  return {
    street: "flop",
    board: [],
    hole: [],
    pot: 100,
    toCall: 50,
    action: { type: "call" },
    ranges: [],
    ...overrides,
  };
}

test("call bez pot odds je chyba se spočítanou ztrátou", () => {
  // equity 20 %, potřebné 33 % → EV = 0,2 × 150 − 50 = −20
  const result = gradeDecision(facingBet(), 0.2);
  assert.equal(result.verdict, "mistake");
  assert.ok(Math.abs(result.evLoss - 20) < 1e-9, `ztráta ${result.evLoss}`);
  assert.ok(Math.abs(result.required - 1 / 3) < 1e-9);
});

test("správný fold je bez ztráty", () => {
  const result = gradeDecision(facingBet({ action: { type: "fold" } }), 0.2);
  assert.equal(result.verdict, "good");
  assert.equal(result.evLoss, 0);
});

test("fold s dostatkem equity je chyba", () => {
  // equity 50 % → EV = 0,5 × 150 − 50 = +25
  const result = gradeDecision(facingBet({ action: { type: "fold" } }), 0.5);
  assert.equal(result.verdict, "mistake");
  assert.ok(Math.abs(result.evLoss - 25) < 1e-9);
});

test("dobrý call je oceněný, ne chyba", () => {
  const result = gradeDecision(facingBet(), 0.5);
  assert.equal(result.verdict, "good");
  assert.equal(result.evLoss, 0);
});

test("raise s handou pod pot odds je chyba", () => {
  const result = gradeDecision(
    facingBet({ action: { type: "raise", amount: 150 } }),
    0.1,
  );
  assert.equal(result.verdict, "mistake");
});

test("check se silnou handou na riveru je tip", () => {
  const result = gradeDecision(
    facingBet({
      street: "river",
      toCall: 0,
      pot: 100,
      action: { type: "check" },
      opponents: 1,
      canBet: true,
    }),
    0.9,
  );
  assert.equal(result.verdict, "tip");
  assert.equal(result.evLoss, 0);
});

test("check se slabou handou proti station je v pořádku", () => {
  const result = gradeDecision(
    facingBet({
      street: "river",
      toCall: 0,
      pot: 100,
      action: { type: "check" },
      opponents: 1,
      canBet: true,
      aggressor: { profileId: "station" },
    }),
    0.25,
  );
  assert.equal(result.verdict, "good");
});

test("multiway check se nechává jako kontext", () => {
  const result = gradeDecision(
    facingBet({
      street: "river",
      toCall: 0,
      pot: 100,
      action: { type: "check" },
      opponents: 3,
      canBet: true,
    }),
    0.45,
  );
  assert.equal(result.verdict, "info");
});

test("bet bez fold equity je kontext, ne chyba", () => {
  const result = gradeDecision(
    facingBet({
      street: "river",
      toCall: 0,
      pot: 100,
      action: { type: "bet", amount: 80 },
      opponents: 1,
      canBet: true,
      aggressor: { profileId: "station" },
    }),
    0.15,
  );
  assert.equal(result.verdict, "info");
});

test("mimo pozici se equity sráží", () => {
  const result = evaluateDecision(
    {
      street: "flop",
      board: [],
      hole: [],
      pot: 100,
      toCall: 50,
      canBet: false,
      opponents: 1,
      inPosition: false,
      action: { type: "fold" },
      ranges: [],
    },
    { iterations: 10 },
  );

  assert.equal(result.rawEquity, 0.5);
  assert.ok(Math.abs(result.equity - 0.43) < 1e-9);
  assert.equal(result.realization, 0.86);
});

test("strategické poznámky zmíní typ soupeře i pozici", () => {
  const result = evaluateDecision(
    {
      street: "flop",
      board: [],
      hole: [],
      pot: 100,
      toCall: 50,
      canBet: false,
      opponents: 1,
      inPosition: false,
      aggressor: { profileId: "station" },
      action: { type: "call" },
      ranges: [],
    },
    { iterations: 10 },
  );

  const text = result.strategicNotes.join(" ");
  assert.match(text, /volumeč/i);
  assert.match(text, /pozici/i);
});

test("reviewHand sečte chyby a ztrátu v bb", () => {
  const decisions = [
    facingBet({ action: { type: "call" } }), // equity 50 % → dobré
    facingBet({ action: { type: "fold" } }), // equity 50 % → chyba −25
  ];

  const review = reviewHand(decisions, { bigBlind: 2, iterations: 5 });

  assert.equal(review.items.length, 2);
  assert.equal(review.mistakes, 1);
  assert.ok(Math.abs(review.totalLoss - 25) < 1e-9);
  assert.ok(Math.abs(review.totalLossBb - 12.5) < 1e-9);
});

test("reviewHand zvládne handu bez rozhodnutí", () => {
  const review = reviewHand([], { bigBlind: 2 });
  assert.equal(review.items.length, 0);
  assert.equal(review.mistakes, 0);
  assert.equal(review.totalLoss, 0);
});

test("poměr pot odds se počítá z potu včetně sázky", () => {
  const result = gradeDecision(
    facingBet({ pot: 60, toCall: 20 }),
    0.3,
  );
  // required = 20 / 80 = 25 %
  assert.ok(Math.abs(result.required - 0.25) < 1e-9);
});

test("exploit: bluff proti volumečovi je špatný", () => {
  const result = exploitVerdict(
    { action: { type: "bet" }, aggressor: { profileId: "station" } },
    0.2,
  );
  assert.equal(result.verdict, "bad");
});

test("exploit: hodnotová sázka proti volumečovi je dobrá", () => {
  const result = exploitVerdict(
    { action: { type: "bet" }, aggressor: { profileId: "station" } },
    0.7,
  );
  assert.equal(result.verdict, "good");
});

test("exploit: fold proti nitovi je v pořádku", () => {
  const result = exploitVerdict(
    { action: { type: "fold" }, aggressor: { profileId: "nit" } },
    0.4,
  );
  assert.equal(result.verdict, "good");
});

test("exploit: call proti maniakovi je v pořádku", () => {
  const result = exploitVerdict(
    { action: { type: "call" }, aggressor: { profileId: "maniac" } },
    0.4,
  );
  assert.equal(result.verdict, "good");
});

test("exploit: call s malou šancí proti volumečovi je špatný", () => {
  const result = exploitVerdict(
    { action: { type: "call" }, aggressor: { profileId: "station" } },
    0.2,
  );
  assert.equal(result.verdict, "bad");
});

test("exploit: bez známého soupeře nic netvrdí", () => {
  assert.equal(
    exploitVerdict({ action: { type: "call" }, aggressor: null }, 0.5),
    null,
  );
});

test("riziko: call s dost šancí je oprávněný", () => {
  const risk = riskVerdict(
    { action: { type: "call" }, toCall: 20, pot: 60, stack: 100 },
    0.5,
  );

  assert.ok(Math.abs(risk.share - 0.2) < 1e-9);
  assert.equal(risk.verdict, "ok");
});

test("riziko: call bez šancí je zbytečné riziko", () => {
  const risk = riskVerdict(
    { action: { type: "call" }, toCall: 50, pot: 50, stack: 100 },
    0.2,
  );

  assert.equal(risk.verdict, "high");
  assert.match(risk.note, /zbytečné riziko/);
});

test("riziko: drobný call se nehlásí jako chyba", () => {
  const risk = riskVerdict(
    { action: { type: "call" }, toCall: 2, pot: 100, stack: 100 },
    0.1,
  );

  assert.equal(risk.verdict, "small");
  assert.match(risk.note, /jen 2 %/);
});

test("riziko: bez sázky vrací null", () => {
  assert.equal(
    riskVerdict({ action: { type: "check" }, toCall: 0, pot: 10, stack: 100 }, 0.5),
    null,
  );
});
