import { test } from "node:test";
import assert from "node:assert/strict";
import { bbToChips, chipsToBb, formatBb, clampRaise } from "../app/bets.js";

test("2,5 bb při blindech 1/2 je pět žetonů", () => {
  assert.equal(bbToChips(2.5, 2), 5);
  assert.equal(bbToChips(3, 2), 6);
  assert.equal(bbToChips(1, 2), 2);
});

test("půl žetonu se zaokrouhlí nahoru", () => {
  assert.equal(bbToChips(2.5, 1), 3);
});

test("formát bb používá českou desetinnou čárku", () => {
  assert.equal(formatBb(12, 2), "6 bb");
  assert.equal(formatBb(13, 2), "6,5 bb");
  assert.equal(formatBb(2, 2), "1 bb");
});

test("clampRaise drží hodnotu v legálním rozsahu", () => {
  const legal = { minRaiseTo: 4, maxRaiseTo: 100 };
  assert.equal(clampRaise(2, legal), 4, "pod minimem se zvedne");
  assert.equal(clampRaise(50, legal), 50, "uvnitř zůstane");
  assert.equal(clampRaise(200, legal), 100, "nad maximem se stropuje");
  assert.equal(clampRaise(4.4, legal), 4, "zaokrouhlí na celé žetony");
});

test("chipsToBb je inverzní k bbToChips", () => {
  assert.equal(chipsToBb(5, 2), 2.5);
  assert.equal(chipsToBb(6, 2), 3);
  assert.equal(bbToChips(chipsToBb(13, 2), 2), 13);
});
