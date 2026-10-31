import { test } from "node:test";
import assert from "node:assert/strict";
import { GameController, HERO_SEAT, SEATS } from "../app/controller.js";

test("interaktivní handa: člověk dorovnává, boti dohrají, žetony sedí", () => {
  const game = new GameController({ seed: 7 });

  for (let hand = 0; hand < 3; hand++) {
    game.startHand();

    let guard = 0;
    while (!game.isComplete) {
      assert.ok(++guard < 500, "handa se zacyklila");

      if (game.isHumanTurn) {
        const legal = game.legal();
        assert.ok(legal, "na tahu člověka musí existovat legální akce");
        game.act(legal.canCheck ? { type: "check" } : { type: "call" });
      } else {
        assert.equal(game.stepBot(), true, "bot musí zahrát, když je na řadě");
      }
    }

    game.settle();
  }

  assert.equal(game.table.handCount, 3);
  assert.equal(game.table.chipCount, game.table.totalChips);
});

test("mimo svůj tah člověk nemůže hrát", () => {
  const game = new GameController({ seed: 3 });
  game.startHand();

  // Button je na seat 0, člověk sedí na HERO_SEAT → první na řadě není.
  assert.equal(game.isHumanTurn, false);
  assert.equal(game.legal(), null);
  assert.throws(() => game.act({ type: "check" }), /na řadě/);
});

test("fold ukončí účast člověka a handa dohraje", () => {
  const game = new GameController({ seed: 11 });
  game.startHand();

  while (!game.isHumanTurn) {
    assert.equal(game.stepBot(), true);
  }

  game.act({ type: "fold" });
  assert.equal(game.hand.seats[HERO_SEAT].folded, true);

  let guard = 0;
  while (!game.isComplete) {
    assert.ok(++guard < 500);
    game.stepBot();
  }

  game.settle();
  assert.equal(game.table.chipCount, game.table.totalChips);
});

test("stůl má devět seatů a člověk na posledním", () => {
  const game = new GameController({ seed: 1 });
  assert.equal(SEATS, 9);
  assert.equal(game.table.stacks.length, 9);
  assert.equal(HERO_SEAT, 8);
  assert.equal(game.nameOf(HERO_SEAT), "Ty");
});

test("6-max: šest seatů, člověk dole, pozice sedí", () => {
  const game = new GameController({ seed: 1, seats: 6 });

  assert.equal(game.seats, 6);
  assert.equal(game.table.stacks.length, 6);
  assert.equal(game.humanSeat, 5);

  game.startHand();

  // Button je na seat 0, člověk na 5 → offset 5 = CO.
  assert.equal(game.positionOf(5), "CO");
  assert.equal(game.positionOf(0), "BTN");
  assert.equal(game.positionOf(3), "UTG");
});

test("6-max handa dohraje a žetony sedí", () => {
  const game = new GameController({ seed: 4, seats: 6 });
  game.startHand();

  let guard = 0;
  while (!game.isComplete && guard++ < 300) {
    if (game.isHumanTurn) {
      const legal = game.legal();
      game.act(legal.canCheck ? { type: "check" } : { type: "call" });
    } else {
      game.stepBot();
    }
  }

  game.settle();

  assert.equal(game.table.handCount, 1);
  assert.equal(game.table.chipCount, game.table.totalChips);
});

test("neplatný počet seatů je chyba", () => {
  assert.throws(() => new GameController({ seats: 1 }), /2 až 10/);
  assert.throws(() => new GameController({ seats: 11 }), /2 až 10/);
});

test("bez startHand nejde settle a dvojí start je chyba", () => {
  const game = new GameController({ seed: 1 });
  assert.throws(() => game.settle(), /neskončila/);

  game.startHand();
  assert.throws(() => game.startHand(), /ještě neskončila/);
});
