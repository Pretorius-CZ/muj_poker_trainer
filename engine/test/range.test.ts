import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCards, cardToString } from "../src/cards.ts";
import {
  parseRange,
  filterRange,
  rangeSize,
  rangePercent,
  expandToken,
  classCombos,
  comboToString,
} from "../src/range.ts";

test("pár: AA má 6 kombinací", () => {
  const range = parseRange("AA");
  assert.equal(range.length, 6);
  for (const combo of range) {
    assert.equal(combo.cards[0] >> 2, combo.cards[1] >> 2, "obě karty stejné hodnoty");
  }
});

test("suited a offsuit mají správný počet kombinací", () => {
  assert.equal(parseRange("AKs").length, 4);
  assert.equal(parseRange("AKo").length, 12);
  assert.equal(parseRange("AK").length, 16);
});

test("plus u párů rozbalí celou řadu", () => {
  const range = parseRange("22+");
  assert.equal(range.length, 78, "13 párů × 6 kombinací");
  assert.equal(rangeSize(range), 78);
});

test("plus drží vysokou kartu a zvyšuje nízkou", () => {
  // A2s+ = A2s, A3s, ... AKs → 12 tříd × 4 kombinace
  assert.equal(parseRange("A2s+").length, 48);
  // K9s+ = K9s, KTs, KJs, KQs → 4 třídy × 4
  assert.equal(parseRange("K9s+").length, 16);
});

test("rozsah se stejnou vysokou kartou", () => {
  assert.equal(parseRange("A5s-A2s").length, 16, "4 třídy × 4 kombinace");
  assert.equal(parseRange("99-66").length, 24, "4 páry × 6 kombinací");
  assert.equal(parseRange("KQo-KTo").length, 36, "3 třídy × 12 kombinací");
});

test("duplicity se sloučí", () => {
  assert.equal(parseRange("AA, AA, AA").length, 6);
  assert.equal(parseRange("AK, AKs").length, 16, "AKs už je uvnitř AK");
  assert.equal(parseRange("AKs, AKo, AK").length, 16);
});

test("kombinace jsou konkrétní karty", () => {
  const range = parseRange("AKs");
  for (const combo of range) {
    assert.equal(combo.cards[0] & 3, combo.cards[1] & 3, "stejná barva");
  }
  const names = range.map(comboToString).sort();
  assert.deepEqual(names, ["AcKc", "AdKd", "AhKh", "AsKs"].sort());
});

test("range má správné procento prostoru", () => {
  // 78 / 1326 = 5,88 %
  assert.ok(Math.abs(rangePercent(parseRange("22+")) - 5.882) < 0.01);
});

test("mrtvé karty se odečtou", () => {
  const range = parseRange("AA");
  const dead = parseCards("As");
  const filtered = filterRange(range, dead);
  assert.equal(filtered.length, 3, "eso v pikách vyřadí 3 kombinace");

  for (const combo of filtered) {
    assert.notEqual(cardToString(combo.cards[0]), "As");
    assert.notEqual(cardToString(combo.cards[1]), "As");
  }
});

test("expandToken vrací třídy hand", () => {
  const classes = expandToken("AKs");
  assert.equal(classes.length, 1);
  assert.deepEqual(classes[0], { hi: 14, lo: 13, type: "suited" });

  const pairs = expandToken("QQ+");
  assert.equal(pairs.length, 3, "QQ, KK, AA");
});

test("classCombos pro offsuit nekoliduje s barvou", () => {
  const combos = classCombos({ hi: 14, lo: 13, type: "offsuit" });
  assert.equal(combos.length, 12);
  for (const [a, b] of combos) {
    assert.notEqual(a & 3, b & 3, "offsuit nesmí mít stejnou barvu");
  }
});

test("nesmyslná notace je chyba", () => {
  assert.throws(() => parseRange("XX"), /Neplatná hodnota/);
  assert.throws(() => parseRange("KA"), /od vyšší karty/);
  assert.throws(() => parseRange("AAs"), /Pár se nepíše/);
  assert.throws(() => parseRange("AKx"), /Neznámá barva/);
  assert.throws(() => parseRange("AK-AQ"), /konkrétní/);
  assert.throws(() => parseRange("A5s-K2s"), /stejnou vysokou kartu/);
});
