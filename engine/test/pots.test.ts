import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPots } from "../src/pots.ts";

test("jeden vkladatel → jeden pot", () => {
  const pots = buildPots([{ seat: 0, amount: 10, folded: false }]);
  assert.deepEqual(pots, [{ amount: 10, eligible: [0], cap: 10 }]);
});

test("všichni stejně → jeden pot se všemi", () => {
  const pots = buildPots([
    { seat: 0, amount: 10, folded: false },
    { seat: 1, amount: 10, folded: false },
    { seat: 2, amount: 10, folded: false },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 30);
  assert.deepEqual(pots[0].eligible, [0, 1, 2]);
});

test("tři all-iny různých výšek → tři vrstvy", () => {
  const pots = buildPots([
    { seat: 0, amount: 100, folded: false },
    { seat: 1, amount: 50, folded: false },
    { seat: 2, amount: 20, folded: false },
  ]);

  assert.equal(pots.length, 3);
  assert.deepEqual(pots[0], { amount: 60, eligible: [0, 1, 2], cap: 20 });
  assert.deepEqual(pots[1], { amount: 60, eligible: [0, 1], cap: 50 });
  // Nevolaná část sázky — nárok má jen hráč 0.
  assert.deepEqual(pots[2], { amount: 50, eligible: [0], cap: 100 });

  assert.equal(pots.reduce((sum, pot) => sum + pot.amount, 0), 170);
});

test("foldnutý hráč přispívá, ale nemá nárok", () => {
  const pots = buildPots([
    { seat: 0, amount: 30, folded: false },
    { seat: 1, amount: 30, folded: false },
    { seat: 2, amount: 10, folded: true },
  ]);

  assert.equal(pots.length, 2);
  assert.deepEqual(pots[0], { amount: 30, eligible: [0, 1], cap: 10 });
  assert.deepEqual(pots[1], { amount: 40, eligible: [0, 1], cap: 30 });
  assert.equal(pots.reduce((sum, pot) => sum + pot.amount, 0), 70);
});

test("prázdné vklady → žádný pot", () => {
  assert.deepEqual(buildPots([]), []);
  assert.deepEqual(buildPots([{ seat: 0, amount: 0, folded: false }]), []);
});
