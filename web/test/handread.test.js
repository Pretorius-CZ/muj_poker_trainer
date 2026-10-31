import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCards } from "../engine/cards.js";
import { readHolding } from "../app/handread.js";

function read(hole, board = "") {
  return readHolding(parseCards(hole), parseCards(board));
}

test("preflop: pár a suited", () => {
  assert.equal(read("As Ah").made, "pár A");
  assert.equal(read("As Ks").made, "A K v jedné barvě, spojovačka");
  assert.equal(read("As Kh").made, "A K v různých barvách, spojovačka");
});

test("top pár, druhý pár a overpair", () => {
  assert.equal(read("As Kh", "Kd 7c 2s").made, "top pár K");
  assert.equal(read("Qs Kh", "Ad Kc 2s").made, "druhý pár K");
  assert.equal(read("As Ah", "9d 7c 2s").made, "overpair A");
  assert.equal(read("9s 9h", "Kd Qc 2s").made, "podpár 9");
});

test("set vs trojice", () => {
  assert.equal(read("9s 9h", "9d 7c 2s").made, "set 9");
  assert.equal(read("9s 8h", "9d 9c 2s").made, "trojice 9");
});

test("dva páry", () => {
  assert.equal(read("As Kh", "Ad Kc 2s").made, "dva páry A a K");
});

test("pár na stole, když se nic netrefilo", () => {
  assert.equal(read("Ah Kd", "9c 9d 2s").made, "pár na stole 9");
});

test("flush draw, včetně do esa", () => {
  assert.equal(read("9s 2s", "Ks 7s 3d").draws[0], "flush draw");
  assert.equal(read("As 2s", "Ks 7s 3d").draws[0], "flush draw (do esa)");
});

test("open-ended a gutshot", () => {
  assert.ok(read("8h 7h", "9c Tc 2d").draws.includes("open-ended straight draw"));
  assert.ok(read("8h 6h", "9c 5d 2s").draws.includes("gutshot"));
});

test("na riveru už žádné drawy", () => {
  const holding = read("As 2s", "Ks 7s 3d 4c 5h");
  assert.deepEqual(holding.draws, []);
});

test("dvě overcards", () => {
  const holding = read("Ah Kd", "9c 7d 2s");
  assert.equal(holding.made, "vysoká karta A");
  assert.ok(holding.draws.includes("dvě overcards"));
});

test("krátká verze pro seat obsahuje draw", () => {
  const holding = read("9s 2s", "Ks 7s 3d");
  assert.match(holding.short, /draw/);
  assert.match(holding.text, /flush draw/);
});

test("neplatné karty vrátí null", () => {
  assert.equal(readHolding([], []), null);
});
