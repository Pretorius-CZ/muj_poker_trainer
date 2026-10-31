/**
 * Boční „solver" — doporučení akce pro aktuální situaci.
 *
 * Není to GTO solver a nikdy to tak nebude tvrdit. Je to model, který staví
 * na tom, co už aplikace umí: odhad rozsahů soupeřů podle jejich akcí,
 * Monte Carlo šance, cena dorovnání, fold equity a exploit heuristiky.
 *
 * Doporučení se počítá jen ve chvíli, kdy jsi na řadě — jinak není co radit.
 */

import { equityVsRanges } from "../engine/equity.js";
import { topPercentRange } from "../engine/strength.js";
import { rangeTierFor } from "../engine/archetypes.js";
import { createRng } from "../engine/rng.js";
import { readHolding } from "./handread.js";

/** Jak často daný archetyp foldne na sázku — hrubý odhad pro fold equity. */
const FOLD_TO_BET = {
  station: 0.18,
  "loose-passive": 0.28,
  nit: 0.55,
  "weak-tight": 0.6,
  tag: 0.45,
  abc: 0.45,
  tricky: 0.4,
  maniac: 0.2,
};

function pct(value) {
  return `${Math.round(value * 100)} %`;
}

function signedBb(chips, bigBlind) {
  const value = chips / bigBlind;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1).replace(".", ",")} bb`;
}

function lastAggressor(hand, excludeSeat) {
  for (let index = hand.log.length - 1; index >= 0; index--) {
    const event = hand.log[index];
    if (event.seat === excludeSeat) continue;
    if (event.action === "bet" || event.action === "raise") return event.seat;
  }
  return null;
}

function positionRank(hand, seat) {
  return (seat - hand.button - 1 + hand.seats.length) % hand.seats.length;
}

function opponentsLabel(count) {
  if (count === 1) return "1 soupeř";
  if (count <= 4) return `${count} soupeři`;
  return `${count} soupeřů`;
}

export function advise(game, { iterations = 600 } = {}) {
  if (!game.isHumanTurn) return null;

  const hand = game.hand;
  const seat = game.humanSeat;
  const me = hand.seats[seat];
  const legal = game.legal();
  if (!legal) return null;

  const ranges = [];
  for (const other of hand.seats) {
    if (other.seat === seat || other.folded || other.hole.length === 0) continue;
    ranges.push(topPercentRange(rangeTierFor(hand, other.seat)));
  }

  const rng = createRng(20241031);
  let equity = 0.5;

  if (ranges.length > 0) {
    try {
      equity = equityVsRanges(me.hole, ranges, hand.board, iterations, rng).equity;
    } catch {
      equity = 0.5;
    }
  }

  const bigBlind = game.table.config.bigBlind;
  const pot = hand.pot;
  const toCall = legal.toCall;
  const required = toCall > 0 ? toCall / (pot + toCall) : 0;

  const villainSeat = lastAggressor(hand, seat);
  const villainProfile = villainSeat === null ? null : game.profiles[villainSeat];
  const villainId = villainProfile ? villainProfile.id : null;
  const villainName = villainSeat === null ? null : game.nameOf(villainSeat);

  const inPosition =
    villainSeat === null
      ? true
      : positionRank(hand, seat) > positionRank(hand, villainSeat);

  const holding = readHolding(me.hole, hand.board);
  const reasons = [];

  if (holding) reasons.push(`Držíš: ${holding.text}.`);

  let action;
  let amount = null;
  let label;
  let confidence = "těsné";
  let margin = 0;

  if (toCall > 0) {
    margin = equity - required;

    // Proti maniakovi se dorovnává o chlup širší, protože bluffuje víc.
    const callable = margin >= 0.02 || (villainId === "maniac" && margin >= -0.03);

    if (callable) {
      if (legal.canRaise && equity >= 0.72) {
        action = "raise";
        amount = Math.max(
          legal.minRaiseTo,
          Math.min(legal.maxRaiseTo, Math.round(hand.currentBetSize * 3)),
        );
        label = `Zvýšit na ${(amount / bigBlind).toFixed(1).replace(".", ",")} bb`;
        confidence = "silné";
        reasons.push(`Máš ${pct(equity)} — dost na zvýšení pro hodnotu.`);
      } else {
        action = "call";
        label = `Dorovnat ${toCall}`;
        confidence = margin >= 0.08 ? "silné" : "těsné";
        reasons.push(`Potřebuješ ${pct(required)}, máš ${pct(equity)}.`);
      }
    } else {
      action = "fold";
      label = "Zahodit";
      confidence = margin <= -0.08 ? "silné" : "těsné";
      reasons.push(`Potřebuješ ${pct(required)}, máš ${pct(equity)}.`);
    }
  } else if (legal.canBet) {
    const bet = Math.max(bigBlind, Math.round(pot * 0.66));
    const fold = FOLD_TO_BET[villainId] ?? 0.4;
    const evBet = fold * pot + (1 - fold) * (equity * (pot + 2 * bet) - bet);
    const evCheck = equity * pot;
    margin = evBet - evCheck;

    let wantBet = margin > 0.1 * pot;

    // Exploit: proti volumečovi se blufuje zbytečně, proti nitovi naopak.
    if (villainId === "station" || villainId === "loose-passive") {
      wantBet = equity >= 0.55;
    }
    if (villainId === "nit" && equity < 0.4 && fold > 0.5) {
      wantBet = true;
    }

    if (wantBet) {
      action = "bet";
      amount = Math.min(bet, legal.maxRaiseTo);
      label = `Vsadit ${(amount / bigBlind).toFixed(1).replace(".", ",")} bb`;
      confidence = margin > 0.2 * pot ? "silné" : "těsné";
      reasons.push(
        `Sázka má modelově vyšší hodnotu než check (${signedBb(margin, bigBlind)}).`,
      );
    } else {
      action = "check";
      label = "Check";
      confidence = "těsné";
      reasons.push("Sázka se modelově nevyplatí víc než check.");
    }
  } else {
    action = "check";
    label = "Check";
    confidence = "silné";
  }

  if (villainId === "station") {
    reasons.push("Volumeč — bluf nefunguje, sázej na hodnotu.");
  } else if (villainId === "nit") {
    reasons.push("Nit — jeho sázky ber vážně, bluf má smysl.");
  } else if (villainId === "maniac") {
    reasons.push("Maniak — dorovnávej širší.");
  }

  if (!inPosition && villainSeat !== null) reasons.push("Jsi mimo pozici.");

  if (ranges.length > 1) {
    const verb = ranges.length <= 4 ? "jsou" : "je";
    reasons.push(`Proti tobě ${verb} ${opponentsLabel(ranges.length)}.`);
  }

  return {
    action,
    amount,
    label,
    confidence,
    equity,
    required,
    toCall,
    pot,
    inPosition,
    holding,
    reasons,
    villainName,
    villainId,
  };
}
