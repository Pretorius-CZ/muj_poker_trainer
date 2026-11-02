import { test } from "node:test";
import assert from "node:assert/strict";
import { narrowRange } from "../app/rangenarrow.js";
import { topPercentRange } from "../engine/strength.js";
import { evaluateBest } from "../engine/evaluator.js";
import { parseCards } from "../engine/cards.js";

function handWith(log, board = "") {
  return { log, board: parseCards(board) };
}

function averageScore(range, board) {
  const cards = parseCards(board);
  return (
    range.reduce((sum, combo) => sum + evaluateBest([...combo.cards, ...cards]), 0) /
    range.length
  );
}

test("range se zúží podle akce na flopu", () => {
  const base = topPercentRange(0.14);
  const range = narrowRange(
    handWith(
      [
        { seat: 1, street: "preflop", action: "raise" },
        { seat: 1, street: "flop", action: "bet" },
      ],
      "Ah Kd 7c",
    ),
    1,
  );

  assert.ok(range.length < base.length);
  assert.ok(range.length >= 20);
});

test("checker má slabší průměrnou handu než bettor", () => {
  const board = "Ah Kd 7c";

  const bettor = narrowRange(
    handWith(
      [
        { seat: 1, street: "preflop", action: "raise" },
        { seat: 1, street: "flop", action: "bet" },
      ],
      board,
    ),
    1,
  );

  const checker = narrowRange(
    handWith(
      [
        { seat: 1, street: "preflop", action: "raise" },
        { seat: 1, street: "flop", action: "check" },
      ],
      board,
    ),
    1,
  );

  assert.ok(averageScore(bettor, board) > averageScore(checker, board));
});

test("turn zúží range ještě víc", () => {
  const flop = narrowRange(
    handWith(
      [
        { seat: 1, street: "preflop", action: "raise" },
        { seat: 1, street: "flop", action: "bet" },
      ],
      "Ah Kd 7c",
    ),
    1,
  );

  const turn = narrowRange(
    handWith(
      [
        { seat: 1, street: "preflop", action: "raise" },
        { seat: 1, street: "flop", action: "bet" },
        { seat: 1, street: "turn", action: "bet" },
      ],
      "Ah Kd 7c 2s",
    ),
    1,
  );

  assert.ok(turn.length <= flop.length);
});
