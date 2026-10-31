// GENEROVÁNO z engine/src/strength.ts — neupravuj přímo.
// Znovu vygeneruješ: node tools/build-web.mjs

/**
 * Preflop síla handy — Chenův vzorec.
 *
 * Proč ne equity proti náhodné handě: ta je fajn na postflop, ale preflop
 * systematicky podceňuje suited spoilery a přeceňuje offsuit broadwaye.
 * Chenův vzorec je stará jednoduchá heuristika navržená přesně na tohle:
 * dává body za vysokou kartu, pár, suitedness, mezeru a spoilery.
 *
 * Slouží k jedinému: převést handu na percentil 0..1, kde 0 = AA a 1 = 72o.
 * Boti pak mají prahy typu "hraju top 20 %". Není to GTO chart — je to
 * rozumný, deterministický a vysvětlitelný odhad.
 */

                                       
import { FULL_DECK, rankOf, suitOf } from "./cards.js";
                                             

/** Bodová hodnota vysoké karty podle Chena, indexováno rankem 2..14. */
const HIGH_CARD_VALUE = [
  0, 0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10,
];

export function chenScore(a      , b      )         {
  const high = Math.max(rankOf(a), rankOf(b));
  const low = Math.min(rankOf(a), rankOf(b));

  let score = HIGH_CARD_VALUE[high];
  const isPair = high === low;

  if (isPair) {
    score = Math.max(5, score * 2);
    return Math.ceil(score);
  }

  if (suitOf(a) === suitOf(b)) score += 2;

  const gap = high - low - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;

  // Spojovací bonus: obě karty pod Q a max. jedna mezera.
  if (gap <= 1 && high < 12) score += 1;

  return Math.ceil(score);
}

let sortedScores                  = null;

/** Všech 1326 kombinací seřazených podle Chenova skóre (od nejslabší). */
function allScores()           {
  if (sortedScores) return sortedScores;

  const scores           = [];
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      scores.push(chenScore(FULL_DECK[a], FULL_DECK[b]));
    }
  }
  scores.sort((x, y) => x - y);
  sortedScores = scores;
  return scores;
}

/**
 * Percentil síly handy: 0 = nejlepší (AA), 1 = nejhorší (72o).
 * Bere v potaz, že silnější třídy mají víc kombinací.
 */
export function handPercentile(a      , b      )         {
  const scores = allScores();
  const score = chenScore(a, b);

  // První index, kde je skóre větší než moje.
  let low = 0;
  let high = scores.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (scores[mid] <= score) low = mid + 1;
    else high = mid;
  }

  let firstEqual = low;
  while (firstEqual > 0 && scores[firstEqual - 1] === score) firstEqual--;

  const better = scores.length - low;
  const equal = low - firstEqual;

  return (better + equal / 2) / scores.length;
}

const topRangeCache = new Map                      ();

/**
 * Range nejsilnějších `percent` procent hand podle Chenova skóre.
 *
 * Pozor: není to GTO range. Je to "top X % podle jednoduché heuristiky" —
 * stačí to na odhad soupeřova range v botovi a na hrubé drilly. Až přijdou
 * skutečné charty, nahradí se.
 */
export function topPercentRange(percent        )               {
  const cached = topRangeCache.get(percent);
  if (cached) return cached;

  const scored                                           = [];
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      const cards               = [FULL_DECK[a], FULL_DECK[b]];
      scored.push({ cards, score: chenScore(cards[0], cards[1]) });
    }
  }

  // Determinismus: při stejném skóre rozhoduje ID karet.
  scored.sort((x, y) => y.score - x.score || x.cards[0] - y.cards[0] || x.cards[1] - y.cards[1]);

  const count = Math.max(1, Math.min(scored.length, Math.round(scored.length * percent)));
  const range = scored.slice(0, count).map((entry) => ({ cards: entry.cards, weight: 1 }));

  topRangeCache.set(percent, range);
  return range;
}
