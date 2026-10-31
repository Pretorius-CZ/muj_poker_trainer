import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCards } from "../src/cards.ts";
import { chenScore, handPercentile, topPercentRange } from "../src/strength.ts";

const pair = (text: string): [number, number] => {
  const cards = parseCards(text);
  return [cards[0], cards[1]];
};

test("Chenovo skóre odpovídá známým hodnotám", () => {
  assert.equal(chenScore(...pair("As Ah")), 20);
  assert.equal(chenScore(...pair("Ks Kh")), 16);
  assert.equal(chenScore(...pair("Qs Qh")), 14);
  assert.equal(chenScore(...pair("As Ks")), 12);
  assert.equal(chenScore(...pair("As Kh")), 10);
  assert.equal(chenScore(...pair("7s 2h")), -1);
});

test("percentil: eso-eso je nejlepší, sedmička-dvojka naopak", () => {
  assert.ok(handPercentile(...pair("As Ah")) < 0.01);
  assert.ok(handPercentile(...pair("7s 2h")) > 0.95);
  assert.ok(
    handPercentile(...pair("As Ah")) < handPercentile(...pair("Ks Kh")),
  );
  assert.ok(
    handPercentile(...pair("Ks Kh")) < handPercentile(...pair("Qs Qh")),
  );
});

test("suited je lepší než offsuit stejných hodnot", () => {
  assert.ok(
    handPercentile(...pair("As Ks")) < handPercentile(...pair("As Kh")),
  );
});

test("topPercentRange vrací správně velký range", () => {
  const top10 = topPercentRange(0.1);
  assert.equal(top10.length, Math.round(1326 * 0.1));

  const top1 = topPercentRange(0.01);
  assert.ok(top1.length >= 1);
  // AA musí být v nejužším range.
  assert.ok(
    top1.some((combo) => {
      const a = combo.cards[0] >> 2;
      const b = combo.cards[1] >> 2;
      return a === 12 && b === 12;
    }),
  );
});

test("topPercentRange je deterministický", () => {
  const first = topPercentRange(0.25).map((combo) => combo.cards.join(","));
  const second = topPercentRange(0.25).map((combo) => combo.cards.join(","));
  assert.deepEqual(first, second);
});
