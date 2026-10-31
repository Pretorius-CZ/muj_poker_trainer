import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCards } from "../src/cards.ts";
import {
  evaluate5,
  evaluate7,
  evaluateBest,
  describeScore,
  scoreCategory,
  scoreRanks,
  HIGH_CARD,
  PAIR,
  TWO_PAIR,
  TRIPS,
  STRAIGHT,
  FLUSH,
  FULL_HOUSE,
  QUADS,
  STRAIGHT_FLUSH,
} from "../src/evaluator.ts";

const score = (cards: string): number => evaluate5(parseCards(cards));
const category = (cards: string): number => scoreCategory(score(cards));

test("rozpozná všechny kategorie", () => {
  assert.equal(category("As Ks Qs Js Ts"), STRAIGHT_FLUSH);
  assert.equal(category("Ah Ad Ac As Kh"), QUADS);
  assert.equal(category("Ah Ad Ac Kh Kd"), FULL_HOUSE);
  assert.equal(category("Ah Kh Qh Jh 9h"), FLUSH);
  assert.equal(category("Ah Kd Qh Jd Tc"), STRAIGHT);
  assert.equal(category("Ah Ad Ac Kh Qd"), TRIPS);
  assert.equal(category("Ah Ad Kh Kd Qc"), TWO_PAIR);
  assert.equal(category("Ah Ad Kh Qd Jc"), PAIR);
  assert.equal(category("Ah Kd Qh Jd 9c"), HIGH_CARD);
});

test("kolo (A-2-3-4-5) je straight s vysokou pětkou", () => {
  assert.equal(category("Ah 2d 3c 4s 5h"), STRAIGHT);
  assert.deepEqual(scoreRanks(score("Ah 2d 3c 4s 5h")), [5]);

  // Kolo ve stejné barvě je straight flush, ne flush.
  assert.equal(category("As 2s 3s 4s 5s"), STRAIGHT_FLUSH);
  assert.deepEqual(scoreRanks(score("As 2s 3s 4s 5s")), [5]);
});

test("královská flush poráží ostatní straight flush", () => {
  assert.ok(score("As Ks Qs Js Ts") > score("9s 8s 7s 6s 5s"));
});

test("kategorie mají správné pořadí", () => {
  const ascending = [
    "Ah Kd Qh Jd 9c", // vysoká karta
    "Ah Ad Kh Qd Jc", // pár
    "Ah Ad Kh Kd Qc", // dva páry
    "Ah Ad Ac Kh Qd", // trojice
    "Ah Kd Qh Jd Tc", // straight
    "Ah Kh Qh Jh 9h", // flush
    "Ah Ad Ac Kh Kd", // full house
    "Ah Ad Ac As Kh", // čtyřka
    "As Ks Qs Js Ts", // straight flush
  ].map(score);

  for (let i = 1; i < ascending.length; i++) {
    assert.ok(
      ascending[i] > ascending[i - 1],
      `kategorie ${i} má být vyšší než ${i - 1}`,
    );
  }
});

test("kicker rozhoduje v rámci kategorie", () => {
  assert.ok(score("Ah Ad Kh Qd Jc") > score("Ah Ad Kh Qd Tc"));
  assert.ok(score("Ah Ad Kh Qd Jc") > score("Ah Ad Qh Jd Tc"));
  assert.equal(score("Ah Ad Kh Qd Jc"), score("As Ac Kd Qh Js"));
});

test("dva páry: rozhoduje vyšší pár, pak nižší", () => {
  assert.ok(score("Ah Ad Kh Kd Qc") > score("Ah Ad Qh Qd Kc"));
  assert.ok(score("Ah Ad Kh Kd Qc") > score("Ah Ad Kh Kd Jc"));
});

test("full house: rozhoduje trojice", () => {
  assert.ok(score("Ah Ad Ac Kh Kd") > score("Kh Kd Kc Ah Ad"));
});

test("evaluate7 vybere nejlepší pětku", () => {
  // Sedm karet obsahuje flush v pikách; výsledek musí být flush, ne dvojice.
  const seven = parseCards("As Ks 9s 4s 2s Kd Kh");
  assert.equal(scoreCategory(evaluate7(seven)), FLUSH);
  assert.equal(describeScore(evaluate7(seven)), "flush A");
});

test("evaluate7 najde i postupku schovanou mezi ostatními kartami", () => {
  const seven = parseCards("9h 8d 7c 6s 5h Kd 2c");
  assert.equal(scoreCategory(evaluate7(seven)), STRAIGHT);
  assert.deepEqual(scoreRanks(evaluate7(seven)), [9]);
});

test("evaluate7 je maximum přes všech 21 kombinací", () => {
  // Deterministický vzorek — žádný Math.random, aby test byl reprodukovatelný.
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let state = 42;
  const rand = (): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };

  for (let trial = 0; trial < 500; trial++) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const seven = shuffled.slice(0, 7);

    let best = -1;
    for (let a = 0; a <= 2; a++)
      for (let b = a + 1; b <= 3; b++)
        for (let c = b + 1; c <= 4; c++)
          for (let d = c + 1; d <= 5; d++)
            for (let e = d + 1; e <= 6; e++) {
              const value = evaluate5([seven[a], seven[b], seven[c], seven[d], seven[e]]);
              if (value > best) best = value;
            }

    assert.equal(evaluate7(seven), best);
  }
});

test("evaluateBest zvládne 5, 6 i 7 karet", () => {
  const five = parseCards("Ah Ad Ac Kh Kd");
  const six = parseCards("Ah Ad Ac Kh Kd 2c");
  const seven = parseCards("Ah Ad Ac Kh Kd 2c 3d");
  assert.equal(evaluateBest(five), evaluate5(five));
  assert.equal(evaluateBest(six), evaluate5(five));
  assert.equal(evaluateBest(seven), evaluate5(five));
});

test("popis handy je čitelný", () => {
  assert.equal(describeScore(score("Ah Ad Ac Kh Kd")), "full house A přes K");
  assert.equal(describeScore(score("Ah Ad Ac As Kh")), "čtyřka A");
  assert.equal(describeScore(score("Ah Ad Kh Qd Jc")), "pár A");
  assert.equal(describeScore(score("Ah Kd Qh Jd 9c")), "vysoká karta A");
});

test("neplatný počet karet je chyba", () => {
  assert.throws(() => evaluate5(parseCards("Ah Kd Qh Jd")));
  assert.throws(() => evaluate7(parseCards("Ah Kd Qh Jd 9c 8s")));
});
