/**
 * Rozhraní pro rozhodování hráčů.
 *
 * V tuhle chvíli jsou tu jen testovací politiky. Skutečné archetypy (nit, TAG,
 * calling station, maniak...) přijdou ve fázi v1 — budou potřebovat equity
 * kalkulačku a model range, který ještě nemáme.
 *
 * Rozhraní je záměrně úzké: politika dostane handu a seat, vrátí akci.
 * Díky tomu jde lidský hráč, bot i "replay z historie" zastrčit za stejné API.
 */

import type { Action, Hand, LegalActions } from "./hand.ts";
import type { Rng } from "./rng.ts";

export type Policy = (hand: Hand, seat: number, rng: Rng) => Action;

function pickRaiseTarget(legal: LegalActions, rng: Rng): number {
  const min = legal.minRaiseTo;
  const max = legal.maxRaiseTo;
  if (min >= max) return max;

  const roll = rng.next();
  if (roll < 0.4) return min;
  if (roll < 0.75) {
    return Math.min(max, Math.round(min + (max - min) * rng.next()));
  }
  return max;
}

/** Náhodná legální akce — dobrá na prošlapání všech stavů enginu. */
export const randomPolicy: Policy = (hand, seat, rng) => {
  const legal = hand.legalActionsFor(hand.seatState(seat));
  const options: Action[] = [];

  if (legal.canFold) options.push({ type: "fold" });
  if (legal.canCheck) options.push({ type: "check" });
  if (legal.canCall) options.push({ type: "call" });
  if (legal.canBet) options.push({ type: "bet", amount: pickRaiseTarget(legal, rng) });
  if (legal.canRaise) options.push({ type: "raise", amount: pickRaiseTarget(legal, rng) });

  return options[rng.nextInt(options.length)];
};

/** Check, nebo dorovnání. Deterministické, hodí se na testy. */
export const checkCallPolicy: Policy = (hand, seat) => {
  const legal = hand.legalActionsFor(hand.seatState(seat));
  if (legal.canCheck) return { type: "check" };
  if (legal.canCall) return { type: "call" };
  return { type: "fold" };
};

/** Fold na jakoukoli sázku, jinak check. */
export const foldToBetPolicy: Policy = (hand, seat) => {
  const legal = hand.legalActionsFor(hand.seatState(seat));
  if (legal.canCheck) return { type: "check" };
  return { type: "fold" };
};
