/**
 * Vyčerpávající test evaluatoru.
 *
 * Projde všech C(52,5) = 2 598 960 pětikaret a ověří dvě věci, které se
 * nedají obejít:
 *   1. Počty jednotlivých kategorií musí přesně sedět na známé hodnoty.
 *      Kdyby byla chyba v porovnávání kickerů nebo v kole, čísla nesedí.
 *   2. Počet různých skóre musí být 7 462 — tolik existuje tříd ekvivalence
 *      pětikaretních hand. Kdyby se dvě různé handy mapovaly na stejné skóre
 *      (nebo naopak stejná na různá), tohle číslo se rozbije.
 *
 * Tohle je pomalý test (~pár sekund), ale je to nejlepší pojistka, kterou
 * evaluator může mít.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { FULL_DECK } from "../src/cards.ts";
import { evaluate5, scoreCategory } from "../src/evaluator.ts";

test("všech 2 598 960 pětikaret: sedí počty kategorií i 7 462 tříd", () => {
  const expectedCounts: Record<number, number> = {
    8: 40, // straight flush
    7: 624, // čtyřka
    6: 3744, // full house
    5: 5108, // flush
    4: 10200, // straight
    3: 54912, // trojice
    2: 123552, // dva páry
    1: 1098240, // pár
    0: 1302540, // vysoká karta
  };

  const counts = new Array<number>(9).fill(0);
  const distinct = new Set<number>();
  const hand = [0, 0, 0, 0, 0];
  let total = 0;

  for (let a = 0; a < 48; a++) {
    hand[0] = FULL_DECK[a];
    for (let b = a + 1; b < 49; b++) {
      hand[1] = FULL_DECK[b];
      for (let c = b + 1; c < 50; c++) {
        hand[2] = FULL_DECK[c];
        for (let d = c + 1; d < 51; d++) {
          hand[3] = FULL_DECK[d];
          for (let e = d + 1; e < 52; e++) {
            hand[4] = FULL_DECK[e];
            const score = evaluate5(hand);
            counts[scoreCategory(score)]++;
            distinct.add(score);
            total++;
          }
        }
      }
    }
  }

  assert.equal(total, 2598960, "počet projitých kombinací");
  assert.equal(distinct.size, 7462, "počet tříd ekvivalence");

  for (const [category, expected] of Object.entries(expectedCounts)) {
    assert.equal(
      counts[Number(category)],
      expected,
      `kategorie ${category} má mít ${expected} hand`,
    );
  }

  const sum = counts.reduce((acc, value) => acc + value, 0);
  assert.equal(sum, 2598960);
});
