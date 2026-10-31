import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendHand,
  buildRecord,
  bumpCumulative,
  bumpTotal,
  computeStats,
  cumulativeStats,
  loadCumulative,
  loadTotals,
  MAX_HANDS,
  seedCumulative,
  totalFor,
} from "../app/session.js";
import { GameController } from "../app/controller.js";
import { reviewHand } from "../app/review.js";

function hand(overrides = {}) {
  return {
    net: 0,
    evLoss: 0,
    mistakes: 0,
    showdown: false,
    actions: [],
    review: [],
    bb: 2,
    ...overrides,
  };
}

test("souhrn: výsledek, VPIP, PFR a agresivita", () => {
  const hands = [
    hand({
      net: 10,
      actions: [
        { street: "preflop", action: "raise" },
        { street: "flop", action: "bet" },
      ],
    }),
    hand({
      net: -6,
      actions: [
        { street: "preflop", action: "call" },
        { street: "flop", action: "call" },
      ],
    }),
  ];

  const stats = computeStats(hands);

  assert.equal(stats.hands, 2);
  assert.equal(stats.net, 4);
  assert.equal(stats.netBb, 2);
  assert.equal(stats.vpip, 1, "obě handy byly dobrovolné");
  assert.equal(stats.pfr, 0.5, "jen první handa byla raise");
  // 1 bet + 1 raise / 2 cally = 1
  assert.equal(stats.af, 1);
  assert.equal(stats.afLabel, "spíš pasivní");
});

test("showdown a typy chyb", () => {
  const hands = [
    hand({
      net: 8,
      showdown: true,
      mistakes: 1,
      review: [{ verdict: "mistake", code: "call-without-odds" }],
    }),
    hand({
      net: -4,
      showdown: true,
      mistakes: 1,
      review: [{ verdict: "mistake", code: "call-without-odds" }],
    }),
    hand({ net: 2 }),
  ];

  const stats = computeStats(hands);

  assert.equal(stats.showdowns, 2);
  assert.equal(stats.showdownWinRate, 0.5);
  assert.equal(stats.mistakes, 2);
  assert.equal(stats.mistakeTypes["call-without-odds"], 2);
});

test("prázdná session nespadne", () => {
  const stats = computeStats([]);

  assert.equal(stats.hands, 0);
  assert.equal(stats.bbPer100, 0);
  assert.equal(stats.af, null);
  assert.equal(stats.notes.length, 1);
});

test("historie se drží na MAX_HANDS", () => {
  let hands = [];
  for (let index = 0; index < MAX_HANDS + 5; index++) {
    hands = appendHand(hands, hand({ net: index }));
  }

  assert.equal(hands.length, MAX_HANDS);
  assert.equal(hands[hands.length - 1].net, MAX_HANDS + 4);
});

test("buildRecord zapíše dohranou handu", () => {
  const game = new GameController({ seed: 3 });
  game.startHand();

  let guard = 0;
  while (!game.isComplete && guard++ < 300) {
    if (game.isHumanTurn) {
      const legal = game.legal();
      game.act(legal.canCheck ? { type: "check" } : { type: "call" });
    } else {
      game.stepBot();
    }
  }

  game.settle();

  const review = reviewHand(game.decisions, { bigBlind: 2 });
  const record = buildRecord(game, review);

  assert.equal(record.handNo, 1);
  assert.equal(record.hole.length, 2);
  assert.equal(record.review.length, game.decisions.length);
  assert.equal(record.mistakes, review.mistakes);
  assert.equal(
    record.net,
    game.hand.seats[game.humanSeat].stack -
      game.hand.initialStacks[game.humanSeat],
  );
  assert.equal(typeof record.position, "string");
  assert.ok(record.position.length > 0);
});

test("agresivita vrací null, když nejsou cally", () => {
  const stats = computeStats([
    hand({ actions: [{ street: "preflop", action: "raise" }] }),
  ]);

  assert.equal(stats.af, null);
  assert.equal(stats.afLabel, "—");
});

test("pásmo se bere podle velikosti stolu", () => {
  const six = computeStats([hand({ seats: 6 })]);
  assert.equal(six.seats, 6);
  assert.deepEqual(six.benchmark.vpip, [0.22, 0.3]);

  const nine = computeStats([hand({ seats: 9 })]);
  assert.equal(nine.seats, 9);
  assert.deepEqual(nine.benchmark.vpip, [0.15, 0.22]);
});

test("po 20 handách se ozve pásmo pro 6-max", () => {
  const hands = Array.from({ length: 20 }, () => hand({ seats: 6 }));
  const stats = computeStats(hands);

  assert.ok(
    stats.notes.some((note) => note.includes("6-max")),
    "poznámky mají zmínit 6-max pásmo",
  );
});

test("celkový počet hand počítá i za oknem detailu", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  try {
    assert.deepEqual(bumpTotal(6), { "6": 1 });
    assert.deepEqual(bumpTotal(6), { "6": 2 });
    assert.deepEqual(bumpTotal(9), { "6": 2, "9": 1 });
    assert.equal(totalFor(loadTotals(), 6), 2);
    assert.equal(totalFor(loadTotals(), 9), 1);
  } finally {
    delete globalThis.localStorage;
  }
});

test("kumulativní součty odpovídají oknu", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  try {
    const records = [
      hand({
        seats: 6,
        net: 10,
        showdown: true,
        actions: [
          { street: "preflop", action: "raise" },
          { street: "flop", action: "bet" },
        ],
      }),
      hand({
        seats: 6,
        net: -4,
        actions: [
          { street: "preflop", action: "call" },
          { street: "flop", action: "call" },
        ],
      }),
    ];

    for (const record of records) bumpCumulative(record);

    const cumulative = cumulativeStats(loadCumulative(), 6, 2);
    const window = computeStats(records);

    assert.equal(cumulative.hands, 2);
    assert.equal(cumulative.net, 6);
    assert.equal(cumulative.vpip, window.vpip);
    assert.equal(cumulative.pfr, window.pfr);
    assert.equal(cumulative.af, window.af);
    assert.equal(cumulative.showdowns, 1);
  } finally {
    delete globalThis.localStorage;
  }
});

test("riziko se sčítá do statistik", () => {
  const stats = computeStats([
    hand({
      review: [
        { risk: { chips: 20, share: 0.4, verdict: "ok", note: "" } },
        { risk: { chips: 5, share: 0.05, verdict: "ok", note: "" } },
        { risk: { chips: 30, share: 0.6, verdict: "high", note: "" } },
      ],
    }),
  ]);

  assert.equal(stats.riskCount, 3);
  assert.ok(Math.abs(stats.riskAvgShare - 0.35) < 1e-9);
  assert.equal(stats.bigRisks, 2);
  assert.equal(stats.bigRiskGood, 1);
});

test("seedCumulative naplní součty z historie", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  try {
    const seeded = seedCumulative([
      hand({ seats: 6 }),
      hand({ seats: 9 }),
      hand({ seats: 6 }),
    ]);

    assert.equal(seeded["6"].hands, 2);
    assert.equal(seeded["9"].hands, 1);
  } finally {
    delete globalThis.localStorage;
  }
});
