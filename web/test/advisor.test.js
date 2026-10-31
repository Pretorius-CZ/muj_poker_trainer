import { test } from "node:test";
import assert from "node:assert/strict";
import { advise } from "../app/advisor.js";
import { GameController } from "../app/controller.js";

const LEGAL_KEY = {
  fold: "canFold",
  call: "canCall",
  check: "canCheck",
  bet: "canBet",
  raise: "canRaise",
};

test("mimo svůj tah advisor nic neříká", () => {
  const game = new GameController({ seed: 1 });
  game.startHand();

  // Button je na seat 0, člověk na 8 → není na řadě.
  assert.equal(game.isHumanTurn, false);
  assert.equal(advise(game), null);
});

test("doporučení je vždy legální akce a handa dohraje", () => {
  for (const seed of [3, 5, 8, 13]) {
    const game = new GameController({ seed, seats: 6 });
    game.startHand();

    let guard = 0;
    while (!game.isComplete && guard++ < 400) {
      if (game.isHumanTurn) {
        const advice = advise(game);
        const legal = game.legal();

        assert.ok(advice, "na tahu musí existovat doporučení");
        assert.ok(
          typeof advice.label === "string" && advice.label.length > 0,
          "doporučení má popisek",
        );
        assert.ok(advice.equity >= 0 && advice.equity <= 1, "equity v rozsahu");
        assert.ok(
          legal[LEGAL_KEY[advice.action]],
          `akce ${advice.action} musí být legální`,
        );

        if (advice.action === "bet" || advice.action === "raise") {
          game.act({ type: advice.action, amount: advice.amount });
        } else {
          game.act({ type: advice.action });
        }
      } else {
        game.stepBot();
      }
    }

    game.settle();
    assert.equal(game.table.chipCount, game.table.totalChips);
  }
});
