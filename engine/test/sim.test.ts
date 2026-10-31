import { test } from "node:test";
import assert from "node:assert/strict";
import { runSimulation } from "../src/sim.ts";

test("simulace 2 000 hand: invarianty drží", () => {
  // Náhodní boti jsou záměrně agresivní (často all-in), takže je to spíš fuzz
  // test než realistická session. Právě proto dobře prošlapává side poty,
  // short all-iny a dorozdávání boardu.
  const stats = runSimulation({ hands: 2000, seed: 2024 });

  assert.deepEqual(stats.errors, [], "žádná chyba nesmí nastat");
  assert.equal(stats.hands, 2000);
  assert.ok(stats.showdownRate > 0.05, "něco musí dojít na showdown");
  assert.ok(stats.showdownRate < 1, "musí nastat i handy bez showdownu");
  assert.ok(stats.handsWithSidePots > 0, "musí vzniknout i side poty");
  assert.equal(
    stats.finalStacks.reduce((sum, stack) => sum + stack, 0),
    stats.totalChips,
    "součet stacků musí odpovídat žetonům ve hře",
  );
});

test("simulace je deterministická podle seedu", () => {
  const first = runSimulation({ hands: 300, seed: 99 });
  const second = runSimulation({ hands: 300, seed: 99 });
  const other = runSimulation({ hands: 300, seed: 100 });

  assert.deepEqual(first.finalStacks, second.finalStacks);
  assert.notDeepEqual(first.finalStacks, other.finalStacks);
});

test("různé velikosti stolu fungují", () => {
  for (const numSeats of [2, 3, 6, 9]) {
    const stats = runSimulation({ hands: 200, seed: 7, numSeats });
    assert.deepEqual(stats.errors, [], `stůl o ${numSeats} hráčích`);
  }
});

test("hluboké stacky a vyšší blindy fungují", () => {
  const stats = runSimulation({
    hands: 400,
    seed: 11,
    startStack: 300,
    smallBlind: 2,
    bigBlind: 5,
  });
  assert.deepEqual(stats.errors, []);
});
