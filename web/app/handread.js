/**
 * Čtečka handy: co vlastně máš ve vztahu ke kartám na stole.
 *
 * Neříká jen "pár" jako evaluator, ale **jaký** pár to je — top pár, druhý
 * pár, overpair, set — a k tomu drawy. To je jazyk, kterým se u stolu mluví
 * a kterým se rozhoduje.
 *
 * Je to popis, ne doporučení: neříká, co máš hrát.
 */

import { rankOf, suitOf, rankName } from "../engine/cards.js";
import {
  evaluateBest,
  scoreCategory,
  describeScore,
  HIGH_CARD,
  PAIR,
  TRIPS,
} from "../engine/evaluator.js";

/** Všech deset pětikaretních straightů (včetně kola A-2-3-4-5). */
const STRAIGHTS = [
  [14, 2, 3, 4, 5],
  [2, 3, 4, 5, 6],
  [3, 4, 5, 6, 7],
  [4, 5, 6, 7, 8],
  [5, 6, 7, 8, 9],
  [6, 7, 8, 9, 10],
  [7, 8, 9, 10, 11],
  [8, 9, 10, 11, 12],
  [9, 10, 11, 12, 13],
  [10, 11, 12, 13, 14],
];

function describePreflop(hole) {
  const [a, b] = hole;
  const rankA = rankOf(a);
  const rankB = rankOf(b);

  if (rankA === rankB) return `pár ${rankName(rankA)}`;

  const high = Math.max(rankA, rankB);
  const low = Math.min(rankA, rankB);
  const gap = high - low;

  let shape = suitOf(a) === suitOf(b) ? "v jedné barvě" : "v různých barvách";
  if (gap === 1) shape += ", spojovačka";
  else if (gap === 2) shape += ", jednomezera";

  return `${rankName(high)} ${rankName(low)} ${shape}`;
}

function describeMade(hole, board) {
  const holeRanks = hole.map(rankOf);
  const boardRanks = board.map(rankOf);

  const score = evaluateBest([...hole, ...board]);
  const category = scoreCategory(score);

  const boardHigh = Math.max(...boardRanks);
  const uniqueBoard = [...new Set(boardRanks)].sort((first, second) => second - first);

  const boardCounts = new Map();
  for (const rank of boardRanks) {
    boardCounts.set(rank, (boardCounts.get(rank) ?? 0) + 1);
  }

  const pocketPair = holeRanks[0] === holeRanks[1];
  const pocketRank = holeRanks[0];

  if (category === PAIR) {
    if (pocketPair) {
      return pocketRank > boardHigh
        ? `overpair ${rankName(pocketRank)}`
        : `podpár ${rankName(pocketRank)}`;
    }

    const pairedRank = holeRanks.find((rank) => boardCounts.has(rank));

    if (pairedRank === undefined) {
      // Párovaná hodnota na stole — ne nejvyšší karta. Na boardu 4♠ 4♦ T♣
      // je to pár 4, i když T je vyšší.
      const boardPair = [...boardCounts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([rank]) => rank)
        .sort((first, second) => second - first)[0];

      return `pár na stole ${rankName(boardPair ?? uniqueBoard[0])}`;
    }
    if ((boardCounts.get(pairedRank) ?? 0) >= 2) {
      return `trojice ${rankName(pairedRank)}`;
    }
    if (pairedRank === uniqueBoard[0]) return `top pár ${rankName(pairedRank)}`;
    if (pairedRank === uniqueBoard[1]) return `druhý pár ${rankName(pairedRank)}`;
    if (pairedRank === uniqueBoard[2]) return `třetí pár ${rankName(pairedRank)}`;
    return `spodní pár ${rankName(pairedRank)}`;
  }

  if (category === TRIPS) {
    return pocketPair ? `set ${rankName(pocketRank)}` : describeScore(score);
  }

  return describeScore(score);
}

function describeDraws(hole, board) {
  const draws = [];

  // Na riveru už žádné karty nepřijdou.
  if (board.length >= 5) return draws;

  // Flush draw: čtyři karty jedné barvy, aspoň jedna z nich tvoje.
  const suitCounts = [0, 0, 0, 0];
  for (const card of [...hole, ...board]) suitCounts[suitOf(card)]++;

  for (let suit = 0; suit < 4; suit++) {
    if (suitCounts[suit] !== 4) continue;

    const holeCards = hole.filter((card) => suitOf(card) === suit);
    if (holeCards.length === 0) continue;

    const toAce = holeCards.some((card) => rankOf(card) === 14);
    draws.push(toAce ? "flush draw (do esa)" : "flush draw");
    break;
  }

  // Straight draw: čtyři z pěti karet postupky, aspoň jedna tvoje.
  const present = new Set([...hole, ...board].map(rankOf));
  const holeRanks = new Set(hole.map(rankOf));
  const completions = new Set();

  for (const straight of STRAIGHTS) {
    const have = straight.filter((rank) => present.has(rank));
    if (have.length !== 4) continue;
    if (!straight.some((rank) => holeRanks.has(rank))) continue;

    const missing = straight.find((rank) => !present.has(rank));
    completions.add(missing);
  }

  if (completions.size >= 2) draws.push("open-ended straight draw");
  else if (completions.size === 1) draws.push("gutshot");

  return draws;
}

export function readHolding(hole, board = []) {
  if (!hole || hole.length !== 2) return null;

  if (board.length === 0) {
    const made = describePreflop(hole);
    return { made, draws: [], text: made, short: made };
  }

  const made = describeMade(hole, board);
  const draws = describeDraws(hole, board);

  // Overcards: obě karty výš než nejvyšší karta na stole a nic z toho není pár.
  const category = scoreCategory(evaluateBest([...hole, ...board]));
  const boardHigh = Math.max(...board.map(rankOf));
  if (category === HIGH_CARD && Math.min(...hole.map(rankOf)) > boardHigh) {
    draws.push("dvě overcards");
  }

  const text = [made, ...draws].join(" · ");
  const short = draws.length > 0 ? `${made} + draw` : made;

  return { made, draws, text, short };
}
