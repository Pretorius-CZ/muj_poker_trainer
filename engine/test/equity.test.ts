import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCards } from "../src/cards.ts";
import { createRng } from "../src/rng.ts";
import { parseRange } from "../src/range.ts";
import {
  equityVsHands,
  equityVsRange,
  equityVsRanges,
  equityVsRandom,
} from "../src/equity.ts";

const ITERATIONS = 20000;

function approx(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: čekáno ${expected} ± ${tolerance}, dostal ${actual.toFixed(4)}`,
  );
}

test("AKs vs QQ preflop je ~46 %", () => {
  const result = equityVsHands(
    [parseCards("As Ks"), parseCards("Qh Qd")],
    [],
    ITERATIONS,
    createRng(1),
  );
  approx(result.equity, 0.46, 0.02, "AKs vs QQ");
});

test("AA vs KK preflop je ~82 %", () => {
  const result = equityVsHands(
    [parseCards("As Ah"), parseCards("Ks Kh")],
    [],
    ITERATIONS,
    createRng(2),
  );
  approx(result.equity, 0.82, 0.02, "AA vs KK");
});

test("na boardu s královskou flush se dělí", () => {
  const result = equityVsHands(
    [parseCards("2c 3d"), parseCards("4h 5c")],
    parseCards("As Ks Qs Js Ts"),
    ITERATIONS,
    createRng(3),
  );
  assert.equal(result.equity, 0.5);
  assert.equal(result.tie, 1);
});

test("podíly win + tie + lose dávají 1", () => {
  const result = equityVsHands(
    [parseCards("Ah Kh"), parseCards("7c 7d")],
    parseCards("2h 7h 9s"),
    ITERATIONS,
    createRng(4),
  );
  approx(result.win + result.tie + result.lose, 1, 1e-9, "součet podílů");
});

test("stejný seed dá stejný výsledek", () => {
  const first = equityVsHands(
    [parseCards("As Ks"), parseCards("Qh Qd")],
    [],
    2000,
    createRng(9),
  );
  const second = equityVsHands(
    [parseCards("As Ks"), parseCards("Qh Qd")],
    [],
    2000,
    createRng(9),
  );
  assert.equal(first.equity, second.equity);
});

test("equity proti range QQ odpovídá equity proti konkrétní QQ", () => {
  const vsRange = equityVsRange(
    parseCards("As Ks"),
    parseRange("QQ"),
    [],
    ITERATIONS,
    createRng(5),
  );
  approx(vsRange.equity, 0.46, 0.03, "AKs vs range QQ");
});

test("equity proti range se počítá váženě a bez mrtvých karet", () => {
  // Hrdina má eso v pikách → z range AA zbývají 3 kombinace.
  const result = equityVsRange(
    parseCards("As Ks"),
    parseRange("AA"),
    [],
    ITERATIONS,
    createRng(6),
  );
  // Proti AA je AKs zhruba 12 %.
  approx(result.equity, 0.12, 0.02, "AKs vs AA");
});

test("multiway equity proti range sedí s jednoduchým případem", () => {
  const result = equityVsRanges(
    parseCards("As Ks"),
    [parseRange("QQ")],
    [],
    ITERATIONS,
    createRng(7),
  );
  approx(result.equity, 0.46, 0.03, "AKs vs [QQ]");
});

test("equity proti dvěma range je nižší než proti jedné", () => {
  const one = equityVsRanges(
    parseCards("As Ks"),
    [parseRange("QQ")],
    [],
    5000,
    createRng(8),
  );
  const two = equityVsRanges(
    parseCards("As Ks"),
    [parseRange("QQ"), parseRange("JJ")],
    [],
    5000,
    createRng(8),
  );
  assert.ok(two.equity < one.equity, "víc soupeřů = nižší equity");
  assert.ok(two.equity > 0.1, "ale pořád má nějakou šanci");
});

test("equity proti náhodné handě je pro AA vysoká", () => {
  const result = equityVsRandom(parseCards("As Ah"), [], 1, 5000, createRng(10));
  approx(result.equity, 0.85, 0.03, "AA vs náhodná");
});

test("duplicitní karty jsou chyba", () => {
  assert.throws(
    () =>
      equityVsHands(
        [parseCards("As Ks"), parseCards("As Qd")],
        [],
        100,
        createRng(1),
      ),
    /Duplicitní/,
  );
  assert.throws(
    () =>
      equityVsHands(
        [parseCards("As Ks"), parseCards("Qh Qd")],
        parseCards("As 2c 3d"),
        100,
        createRng(1),
      ),
    /Duplicitní/,
  );
});

test("range bez kombinací po odečtení karet je chyba", () => {
  // Všechny čtyři dvojky jsou v hrdinovi a na boardu → z range "22" nic nezbývá.
  assert.throws(
    () =>
      equityVsRange(
        parseCards("2c 2d"),
        parseRange("22"),
        parseCards("2h 2s 3c"),
        100,
        createRng(1),
      ),
    /žádnou kombinaci/,
  );
});
