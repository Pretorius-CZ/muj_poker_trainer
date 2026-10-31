import { test } from "node:test";
import assert from "node:assert/strict";
import { Hand } from "../src/hand.ts";
import type { HandConfig } from "../src/hand.ts";
import { createRng } from "../src/rng.ts";
import { parseCards } from "../src/cards.ts";

/**
 * Pořadí rozdávání (bez burn karet):
 *   kolo 1: seat0, seat1, seat2, ...
 *   kolo 2: seat0, seat1, seat2, ...
 *   pak flop (3), turn (1), river (1)
 */
function makeHand(options: {
  stacks: number[];
  button?: number;
  smallBlind?: number;
  bigBlind?: number;
  ante?: number;
  deck?: string;
}): Hand {
  const config: HandConfig = {
    seats: options.stacks.map((stack) => ({ stack })),
    button: options.button ?? 0,
    smallBlind: options.smallBlind ?? 1,
    bigBlind: options.bigBlind ?? 2,
    ante: options.ante,
    rng: createRng(7),
    deck: options.deck ? parseCards(options.deck) : undefined,
  };
  return new Hand(config).start();
}

test("9-handed: blindy a první na řadě je UTG", () => {
  const hand = makeHand({ stacks: Array(9).fill(100) });

  assert.equal(hand.smallBlindSeat, 1);
  assert.equal(hand.bigBlindSeat, 2);
  assert.equal(hand.actor, 3, "po BB (seat 2) jedná seat 3");
  assert.equal(hand.seatState(1).committedStreet, 1);
  assert.equal(hand.seatState(2).committedStreet, 2);
  assert.equal(hand.pot, 3);
  assert.equal(hand.seatState(0).hole.length, 2);
});

test("heads-up: button je SB, preflop jedná první, na flopu BB", () => {
  const hand = makeHand({ stacks: [100, 100] });

  assert.equal(hand.smallBlindSeat, 0);
  assert.equal(hand.bigBlindSeat, 1);
  assert.equal(hand.actor, 0);

  hand.apply({ type: "call" });
  assert.equal(hand.actor, 1, "BB má opci");
  assert.equal(hand.legalActions().canCheck, true);
  assert.equal(hand.legalActions().canRaise, true);

  hand.apply({ type: "check" });
  assert.equal(hand.street, "flop");
  assert.equal(hand.actor, 1, "na flopu jedná první BB");
});

test("BB má opci, i když všichni jen dorovnali", () => {
  const hand = makeHand({ stacks: [100, 100, 100] });

  assert.equal(hand.actor, 0);
  hand.apply({ type: "call" });
  hand.apply({ type: "call" });

  assert.equal(hand.actor, 2, "na řadě je BB");
  const legal = hand.legalActions();
  assert.equal(legal.canCheck, true);
  assert.equal(legal.canRaise, true);

  hand.apply({ type: "check" });
  assert.equal(hand.street, "flop");
});

test("min-raise preflop: na 3 to nejde, na 4 ano", () => {
  const hand = makeHand({ stacks: [100, 100, 100] });

  assert.throws(() => hand.apply({ type: "raise", amount: 3 }), /Minimální navýšení/);
  hand.apply({ type: "raise", amount: 4 });
  assert.equal(hand.seatState(0).committedStreet, 4);
});

test("min-raise postflop: bet musí být aspoň big blind", () => {
  const hand = makeHand({ stacks: [100, 100] });
  hand.apply({ type: "call" });
  hand.apply({ type: "check" });

  assert.equal(hand.street, "flop");
  assert.equal(hand.actor, 1);

  assert.throws(() => hand.apply({ type: "bet", amount: 1 }), /Minimální/);
  hand.apply({ type: "bet", amount: 2 });

  // Raise musí být aspoň o velikost posledního navýšení (2) — tedy na 4.
  assert.throws(() => hand.apply({ type: "raise", amount: 3 }), /Minimální/);
  hand.apply({ type: "raise", amount: 4 });
});

test("short all-in neotevírá znovu sázku", () => {
  const hand = makeHand({ stacks: [100, 100, 15] });

  hand.apply({ type: "raise", amount: 10 });
  hand.apply({ type: "call" });

  // Seat 2 má jen 15 → all-in za 15, což je méně než min-raise na 18.
  const shortStack = hand.legalActions();
  assert.equal(shortStack.canRaise, true);
  assert.equal(shortStack.minRaiseTo, 15);
  hand.apply({ type: "raise", amount: 15 });

  // Seat 0 už jednou jednal a all-in neotevřel sázku → nesmí re-raisovat.
  const legal = hand.legalActions();
  assert.equal(legal.seat, 0);
  assert.equal(legal.canRaise, false, "short all-in nesmí dát právo re-raise");
  assert.equal(legal.toCall, 5);
  assert.equal(legal.canCall, true);
});

test("plný raise naopak právo re-raise vrací", () => {
  const hand = makeHand({ stacks: [100, 100, 100] });

  hand.apply({ type: "raise", amount: 10 });
  hand.apply({ type: "raise", amount: 30 });

  // Seat 2 (BB) ještě nejednal, takže je na řadě on.
  assert.equal(hand.actor, 2);
  hand.apply({ type: "fold" });

  assert.equal(hand.actor, 0);
  assert.equal(hand.legalActions().canRaise, true);
});

test("side poty: tři all-iny různých výšek", () => {
  // Seat 0: AK (vysoká karta), seat 1: QQ (pár), seat 2: 99 + 9 na boardu (trojice).
  const hand = makeHand({
    stacks: [100, 50, 20],
    deck: "Ah Qh 9s Kd Qd 9d 2c 7d 9h Js 3c",
  });

  hand.apply({ type: "raise", amount: 100 }); // seat 0 all-in
  hand.apply({ type: "call" }); // seat 1 all-in za 50
  hand.apply({ type: "call" }); // seat 2 all-in za 20

  assert.equal(hand.complete, true);
  assert.equal(hand.result?.showdown, true);
  assert.equal(hand.result?.pots.length, 3);

  // Main pot 60 vyhrává nejlepší handa (seat 2), side pot 60 (seat 1),
  // nevolaných 50 se vrací seatovi 0.
  assert.deepEqual(
    hand.seats.map((seat) => seat.stack),
    [50, 60, 60],
  );
  assert.equal(
    hand.seats.reduce((sum, seat) => sum + seat.stack, 0),
    170,
    "žetony musí sedět",
  );
});

test("split pot: nezvyklý žeton dostane první výherce po buttonu", () => {
  // Board je královská flush → oba hráči hrají board a dělí se.
  const hand = makeHand({
    stacks: [100, 100, 100],
    deck: "2c 4c 6c 3d 5d 7d As Ks Qs Js Ts",
  });

  hand.apply({ type: "raise", amount: 5 });
  hand.apply({ type: "fold" }); // seat 1 (SB)
  hand.apply({ type: "call" }); // seat 2 (BB)

  assert.equal(hand.pot, 11);

  // Preflop skončil, ale handa pokračuje — board se musí dohrát.
  while (!hand.complete) hand.apply({ type: "check" });

  assert.equal(hand.result?.showdown, true);
  assert.deepEqual(
    hand.seats.map((seat) => seat.stack),
    [100, 99, 101],
  );
});

test("když všichni foldnou, bere pot big blind", () => {
  const hand = makeHand({ stacks: [100, 100, 100] });

  hand.apply({ type: "fold" });
  hand.apply({ type: "fold" });

  assert.equal(hand.complete, true);
  assert.equal(hand.result?.showdown, false);
  assert.deepEqual(
    hand.seats.map((seat) => seat.stack),
    [100, 99, 101],
  );
});

test("all-in preflop: board se dorozdá do riveru", () => {
  const hand = makeHand({ stacks: [100, 100] });

  hand.apply({ type: "raise", amount: 100 });
  hand.apply({ type: "call" });

  assert.equal(hand.complete, true);
  assert.equal(hand.board.length, 5);
  assert.equal(hand.street, "showdown");
  assert.equal(
    hand.seats.reduce((sum, seat) => sum + seat.stack, 0),
    200,
  );
});

test("ante se počítá do potu, ale ne do sázky na street", () => {
  const hand = makeHand({ stacks: [100, 100, 100], ante: 1 });

  assert.equal(hand.pot, 6, "3× ante + SB + BB");
  assert.equal(hand.seatState(0).committedStreet, 0, "ante není sázka na street");
  assert.equal(hand.seatState(1).committedStreet, 1);
  assert.equal(hand.seatState(2).committedStreet, 2);
});

test("nelegální akce jsou odmítnuté", () => {
  const hand = makeHand({ stacks: [100, 100, 100] });

  assert.throws(() => hand.apply({ type: "check" }), /Nelze checkovat/);
  assert.throws(() => hand.apply({ type: "raise" }), /potřebuje částku/);
  assert.throws(() => hand.apply({ type: "raise", amount: 500 }), /nemáš žetony/);
});

test("po konci handy už nejde hrát", () => {
  const hand = makeHand({ stacks: [100, 100, 100] });
  hand.apply({ type: "fold" });
  hand.apply({ type: "fold" });

  assert.throws(() => hand.legalActions(), /skončila/);
  assert.throws(() => hand.apply({ type: "fold" }), /skončila/);
});

test("hráč bez žetonů na dorovnání jde all-in", () => {
  // Seat 1 je SB se stackem 6: po postingu mu zbývá 5 a čelí sázce 10.
  const hand = makeHand({ stacks: [100, 6, 100] });

  hand.apply({ type: "raise", amount: 10 });
  assert.equal(hand.actor, 1);

  const legal = hand.legalActions();
  assert.equal(legal.canCall, true);
  assert.equal(legal.toCall, 5, "dorovnává jen to, co má");
  assert.equal(legal.canRaise, false, "na raise nemá žetony");

  hand.apply({ type: "call" });
  assert.equal(hand.seatState(1).allIn, true);
  assert.equal(hand.seatState(1).stack, 0);
});
