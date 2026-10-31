import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCards } from "../engine/cards.js";
import {
  SPOTS,
  actionFor,
  chartCells,
  dealHand,
  gradePreflop,
  handLabel,
  preflopAdvice,
  vsSpotFor,
} from "../app/preflop.js";
import { createRng } from "../engine/rng.js";

test("každý spot má rozumné prahy", () => {
  for (const spot of SPOTS) {
    assert.ok(spot.raise > 0 && spot.raise < 1, spot.id);
    if (spot.kind === "vs") {
      assert.ok(spot.call > spot.raise, spot.id);
      assert.ok(spot.call < 1, spot.id);
    }
  }
});

test("AA se hraje z každé pozice, 72o nikdy", () => {
  for (const spot of SPOTS) {
    assert.equal(gradePreflop(spot, parseCards("As Ah")).action, "raise", spot.id);
    assert.equal(gradePreflop(spot, parseCards("7s 2h")).action, "fold", spot.id);
  }
});

test("mezi prahy vzniká call jen u spotů proti openu", () => {
  const rfi = SPOTS.find((spot) => spot.kind === "rfi");
  const vs = SPOTS.find((spot) => spot.kind === "vs");

  assert.equal(actionFor(rfi, 0.1), "raise");
  assert.equal(actionFor(vs, 0.05), "raise");
  assert.equal(actionFor(vs, 0.1), "call");
  assert.equal(actionFor(vs, 0.5), "fold");
});

test("tabulka má 169 buněk a obsahuje AA i 72o", () => {
  const cells = chartCells(SPOTS[0]);
  assert.equal(cells.length, 169);

  const byLabel = new Map(cells.map((cell) => [cell.label, cell]));
  assert.equal(byLabel.get("AA").action, "raise");
  assert.equal(byLabel.get("72o").action, "fold");
});

test("handLabel popíše handu správně", () => {
  assert.equal(handLabel(parseCards("As Ah")), "AA");
  assert.equal(handLabel(parseCards("As Ks")), "AKs");
  assert.equal(handLabel(parseCards("As Kh")), "AKo");
});

test("dealHand vrátí dvě různé karty", () => {
  const rng = createRng(1);
  for (let i = 0; i < 50; i++) {
    const cards = dealHand(rng);
    assert.equal(cards.length, 2);
    assert.notEqual(cards[0], cards[1]);
  }
});

const POSITIONS_6 = ["BTN", "SB", "BB", "UTG", "MP", "CO"];

function fakeGame({ heroSeat = 5, raises = [], cards = parseCards("As Ah") }) {
  const holes = Array.from({ length: 6 }, () => []);
  holes[heroSeat] = cards;

  return {
    humanSeat: heroSeat,
    hand: {
      complete: false,
      street: "preflop",
      log: raises.map((seat) => ({
        street: "preflop",
        action: "raise",
        seat,
      })),
      seats: holes.map((hole) => ({ hole })),
    },
    positionOf(seat) {
      return POSITIONS_6[seat];
    },
  };
}

test("živý chart: RFI na BTN bere moje karty", () => {
  const advice = preflopAdvice(fakeGame({ heroSeat: 0 }));

  assert.equal(advice.kind, "rfi");
  assert.equal(advice.spot.id, "rfi-btn");
  assert.equal(advice.action, "raise");
  assert.ok(advice.percentile < 0.05);
});

test("živý chart: BB bez raiseů jen check", () => {
  const advice = preflopAdvice(fakeGame({ heroSeat: 2 }));

  assert.equal(advice.kind, "check");
  assert.equal(advice.spot, undefined);
});

test("živý chart: proti openu z UTG v CO", () => {
  const advice = preflopAdvice(fakeGame({ heroSeat: 5, raises: [3] }));

  assert.equal(advice.kind, "vs");
  assert.equal(advice.spot.id, "vs-open-co");
  assert.equal(advice.openerPosition, "UTG");
});

test("živý chart: BB proti BTN", () => {
  const advice = preflopAdvice(fakeGame({ heroSeat: 2, raises: [0] }));

  assert.equal(advice.spot.id, "vs-btn-bb");
  assert.equal(advice.action, "raise");
});

test("živý chart: proti 3-betu chart nemá", () => {
  const advice = preflopAdvice(fakeGame({ heroSeat: 5, raises: [3, 1] }));

  assert.equal(advice.kind, "none");
});

test("vsSpotFor mapuje pozice", () => {
  assert.equal(vsSpotFor("BB", "UTG"), "vs-utg-bb");
  assert.equal(vsSpotFor("BB", "CO"), "vs-co-bb");
  assert.equal(vsSpotFor("BB", "BTN"), "vs-btn-bb");
  assert.equal(vsSpotFor("CO", "UTG"), "vs-open-co");
  assert.equal(vsSpotFor("BTN", "CO"), "vs-open-btn");
  assert.equal(vsSpotFor("SB", "BTN"), "vs-open-sb");
  assert.equal(vsSpotFor("UTG", "MP"), "vs-open-early");
});
