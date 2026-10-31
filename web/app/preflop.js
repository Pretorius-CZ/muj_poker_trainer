/**
 * Preflop trenér a živý preflop chart pro 6-max.
 *
 * Chartů se drží jedna věc: **kolik procent hand se z dané pozice hraje**.
 * Konkrétní handy se berou podle síly (Chenův percentil), takže rozsahy
 * sedí frekvenčně, ale nejsou to solverová GTO čísla — skutečné charty se
 * liší podle sizingů, ante a poolu. V UI je to tak označené.
 *
 * Dvě použití:
 *   - dril: náhodná handa a spot (trénink),
 *   - živý chart: aktuální handa u stolu (`preflopAdvice`).
 */

import { makeCard } from "../engine/cards.js";
import { handPercentile } from "../engine/strength.js";

const RANK_CHARS = "AKQJT98765432";

export const SPOTS = [
  {
    id: "rfi-utg",
    kind: "rfi",
    hero: "UTG",
    label: "UTG — všichni před tebou fold",
    raise: 0.17,
  },
  {
    id: "rfi-mp",
    kind: "rfi",
    hero: "MP",
    label: "MP — nikdo neotevřel",
    raise: 0.21,
  },
  {
    id: "rfi-co",
    kind: "rfi",
    hero: "CO",
    label: "CO — nikdo neotevřel",
    raise: 0.27,
  },
  {
    id: "rfi-btn",
    kind: "rfi",
    hero: "BTN",
    label: "BTN — nikdo neotevřel",
    raise: 0.42,
  },
  {
    id: "rfi-sb",
    kind: "rfi",
    hero: "SB",
    label: "SB — nikdo neotevřel",
    raise: 0.4,
  },
  {
    id: "vs-utg-bb",
    kind: "vs",
    hero: "BB",
    opener: "UTG/MP",
    label: "BB proti openu z UTG/MP",
    raise: 0.06,
    call: 0.14,
  },
  {
    id: "vs-co-bb",
    kind: "vs",
    hero: "BB",
    opener: "CO",
    label: "BB proti openu z CO",
    raise: 0.1,
    call: 0.22,
  },
  {
    id: "vs-btn-bb",
    kind: "vs",
    hero: "BB",
    opener: "BTN/SB",
    label: "BB proti openu z BTN/SB",
    raise: 0.13,
    call: 0.3,
  },
  {
    id: "vs-open-co",
    kind: "vs",
    hero: "CO",
    opener: "open",
    label: "CO proti openu",
    raise: 0.08,
    call: 0.12,
  },
  {
    id: "vs-open-btn",
    kind: "vs",
    hero: "BTN",
    opener: "open",
    label: "BTN proti openu",
    raise: 0.1,
    call: 0.18,
  },
  {
    id: "vs-open-sb",
    kind: "vs",
    hero: "SB",
    opener: "open",
    label: "SB proti openu",
    raise: 0.12,
    call: 0.16,
  },
  {
    id: "vs-open-early",
    kind: "vs",
    hero: "UTG/MP",
    opener: "open",
    label: "UTG/MP proti openu",
    raise: 0.04,
    call: 0.07,
  },
];

const RFI_BY_POSITION = {
  UTG: "rfi-utg",
  MP: "rfi-mp",
  CO: "rfi-co",
  BTN: "rfi-btn",
  SB: "rfi-sb",
};

const percentileCache = new Map();

function rankChar(rank) {
  return RANK_CHARS[14 - rank];
}

function classPercentile(high, low, type) {
  const key = `${high}-${low}-${type}`;
  if (percentileCache.has(key)) return percentileCache.get(key);

  let a;
  let b;
  if (type === "pair") {
    a = makeCard(high, 0);
    b = makeCard(high, 1);
  } else if (type === "suited") {
    a = makeCard(high, 0);
    b = makeCard(low, 0);
  } else {
    a = makeCard(high, 0);
    b = makeCard(low, 1);
  }

  const value = handPercentile(a, b);
  percentileCache.set(key, value);
  return value;
}

export function actionFor(spot, percentile) {
  if (percentile < spot.raise) return "raise";
  if (spot.call && percentile < spot.call) return "call";
  return "fold";
}

export function gradePreflop(spot, cards) {
  const percentile = handPercentile(cards[0], cards[1]);
  return {
    action: actionFor(spot, percentile),
    percentile,
  };
}

export function handLabel(cards) {
  const first = cards[0];
  const second = cards[1];
  const rankA = (first >> 2) + 2;
  const rankB = (second >> 2) + 2;
  const high = Math.max(rankA, rankB);
  const low = Math.min(rankA, rankB);

  if (high === low) return `${rankChar(high)}${rankChar(low)}`;
  const suited = (first & 3) === (second & 3);
  return `${rankChar(high)}${rankChar(low)}${suited ? "s" : "o"}`;
}

/** 169 buněk 13×13 tabulky pro daný spot. */
export function chartCells(spot) {
  const cells = [];

  for (let row = 14; row >= 2; row--) {
    for (let col = 14; col >= 2; col--) {
      const high = Math.max(row, col);
      const low = Math.min(row, col);
      const type = row === col ? "pair" : col > row ? "suited" : "offsuit";
      const percentile = classPercentile(high, low, type);

      cells.push({
        label:
          type === "pair"
            ? `${rankChar(high)}${rankChar(low)}`
            : `${rankChar(high)}${rankChar(low)}${type === "suited" ? "s" : "o"}`,
        action: actionFor(spot, percentile),
        percentile,
      });
    }
  }

  return cells;
}

/** Náhodná handa ze zamíchaného balíčku. */
export function dealHand(rng) {
  const first = rng.nextInt(52);
  let second = rng.nextInt(52);
  while (second === first) second = rng.nextInt(52);
  return [first, second];
}

export function getSpot(id) {
  return SPOTS.find((spot) => spot.id === id) ?? SPOTS[0];
}

export function percentText(value) {
  return `${Math.round(value * 100)} %`;
}

/** Který „proti openu" spot sedí na tuhle dvojici pozic. */
export function vsSpotFor(heroPosition, openerPosition) {
  if (heroPosition === "BB") {
    if (openerPosition === "CO") return "vs-co-bb";
    if (openerPosition === "BTN" || openerPosition === "SB") return "vs-btn-bb";
    return "vs-utg-bb";
  }
  if (heroPosition === "BTN") return "vs-open-btn";
  if (heroPosition === "SB") return "vs-open-sb";
  if (heroPosition === "CO") return "vs-open-co";
  return "vs-open-early";
}

/**
 * Jaký spot právě hraješ — podle pozice a toho, kolik bylo preflop raiseů.
 * Vrací null mimo preflop nebo když se nedá určit.
 */
export function liveSpot(game) {
  const hand = game.hand;
  if (!hand || hand.complete || hand.street !== "preflop") return null;

  const heroPosition = game.positionOf(game.humanSeat);
  const raises = hand.log.filter(
    (event) => event.street === "preflop" && event.action === "raise",
  );

  if (raises.length === 0) {
    if (heroPosition === "BB") {
      return { kind: "check", label: "BB — nikdo neotevřel, můžeš checknout" };
    }
    const spot = getSpot(RFI_BY_POSITION[heroPosition]);
    return { kind: "rfi", spot, heroPosition };
  }

  if (raises.length === 1) {
    const openerSeat = raises[0].seat;
    const openerPosition = game.positionOf(openerSeat);
    const spot = getSpot(vsSpotFor(heroPosition, openerPosition));
    return { kind: "vs", spot, heroPosition, openerPosition };
  }

  return { kind: "none", label: "Proti 3-betu chart nemám" };
}

/** Živá rada pro aktuální handu: spot + tvoje karty + verdikt. */
export function preflopAdvice(game) {
  const info = liveSpot(game);
  if (!info) return null;
  if (!info.spot) return info;

  const me = game.hand.seats[game.humanSeat];
  const grade = gradePreflop(info.spot, me.hole);

  return { ...info, ...grade, cards: me.hole };
}
