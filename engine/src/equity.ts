/**
 * Výpočet equity — Monte Carlo.
 *
 * Equity = pravděpodobnost, že moje handa vyhraje (nebo se o výhru podělí).
 * Počítá se simulací: dorozdá se board, ohodnotí se všechny handy, spočítá
 * se, kdo vyhrál. Čím víc iterací, tím menší šum.
 *
 * Přesnost: směrodatná odchylka equity je zhruba `0.5 / sqrt(iterace)`.
 * Pro 1 000 iterací ~1,6 %, pro 10 000 ~0,5 %. Na tréninkové rozhodování
 * bohatě stačí 2 000–5 000; na review s přesnými čísly 20 000+.
 *
 * Vše deterministické podle seedu — stejný seed dá stejný výsledek, takže
 * review může být reprodukovatelný.
 */

import type { Card } from "./cards.ts";
import { FULL_DECK } from "./cards.ts";
import { evaluate7 } from "./evaluator.ts";
import type { RangeCombo } from "./range.ts";
import { filterRange, pickCombo } from "./range.ts";
import type { Rng } from "./rng.ts";

export interface EquityResult {
  /** Celkový podíl na potu 0..1 (remíza se dělí). */
  equity: number;
  /** Podíl iterací, kdy handa vyhrála sama. */
  win: number;
  /** Podíl iterací, kdy se dělila. */
  tie: number;
  /** Podíl iterací, kdy prohrála. */
  lose: number;
  iterations: number;
}

function assertUnique(cards: readonly Card[]): void {
  const seen = new Set<Card>();
  for (const card of cards) {
    if (seen.has(card)) {
      throw new Error(`Duplicitní karta v zadání: ${card}`);
    }
    seen.add(card);
  }
}

function assertBoard(board: readonly Card[]): void {
  if (board.length > 5) throw new Error(`Board má víc než 5 karet: ${board.length}`);
}

/**
 * Vytáhne `count` různých karet z poolu, přičemž přeskočí dvě zakázané.
 * Vzorkování je s vracením a odmítáním — pro pět karet z padesáti je to
 * nejjednodušší správná varianta.
 */
function pickDistinct(
  pool: readonly Card[],
  count: number,
  banned1: number,
  banned2: number,
  rng: Rng,
): Card[] {
  const bannedCount = (banned1 >= 0 ? 1 : 0) + (banned2 >= 0 ? 1 : 0);
  if (pool.length - bannedCount < count) {
    throw new Error("V balíčku není dost karet na dorozdání");
  }

  const out: Card[] = [];
  while (out.length < count) {
    const card = pool[rng.nextInt(pool.length)];
    if (card === banned1 || card === banned2) continue;
    if (out.includes(card)) continue;
    out.push(card);
  }
  return out;
}

/** Equity proti známým handám (všechny karty viditelné). */
export function equityVsHands(
  hands: readonly (readonly Card[])[],
  board: readonly Card[],
  iterations: number,
  rng: Rng,
): EquityResult {
  if (hands.length < 2) throw new Error("Equity potřebuje aspoň dvě handy");
  if (iterations <= 0) throw new Error("Počet iterací musí být kladný");
  assertBoard(board);

  const known = new Set<Card>();
  for (const hand of hands) {
    if (hand.length !== 2) throw new Error("Každá handa musí mít dvě karty");
    for (const card of hand) {
      if (known.has(card)) throw new Error(`Duplicitní karta: ${card}`);
      known.add(card);
    }
  }
  for (const card of board) {
    if (known.has(card)) throw new Error(`Duplicitní karta: ${card}`);
    known.add(card);
  }

  const pool = FULL_DECK.filter((card) => !known.has(card));
  const needed = 5 - board.length;
  const fullBoard: Card[] = [...board];
  const seven = new Array<Card>(7);

  let equity = 0;
  let win = 0;
  let tie = 0;
  let lose = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const drawn = pickDistinct(pool, needed, -1, -1, rng);
    fullBoard.length = board.length;
    for (const card of drawn) fullBoard.push(card);

    let best = -1;
    let winners = 0;
    let heroScore = -1;

    for (let index = 0; index < hands.length; index++) {
      const hand = hands[index];
      seven[0] = hand[0];
      seven[1] = hand[1];
      for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];

      const score = evaluate7(seven);
      if (index === 0) heroScore = score;

      if (score > best) {
        best = score;
        winners = 1;
      } else if (score === best) {
        winners++;
      }
    }

    if (heroScore === best) {
      equity += 1 / winners;
      if (winners === 1) win++;
      else tie++;
    } else {
      lose++;
    }
  }

  return {
    equity: equity / iterations,
    win: win / iterations,
    tie: tie / iterations,
    lose: lose / iterations,
    iterations,
  };
}

/** Equity proti range (soupeř má jednu z kombinací v range, váženě). */
export function equityVsRange(
  hero: readonly Card[],
  range: readonly RangeCombo[],
  board: readonly Card[],
  iterations: number,
  rng: Rng,
): EquityResult {
  if (hero.length !== 2) throw new Error("Hrdina musí mít dvě karty");
  if (iterations <= 0) throw new Error("Počet iterací musí být kladný");
  assertBoard(board);
  assertUnique([...hero, ...board]);

  const dead = [...hero, ...board];
  const valid = filterRange(range, dead);
  if (valid.length === 0) {
    throw new Error("Range nemá po odečtení mrtvých karet žádnou kombinaci");
  }

  const deadSet = new Set(dead);
  const pool = FULL_DECK.filter((card) => !deadSet.has(card));
  const needed = 5 - board.length;
  const fullBoard: Card[] = [...board];
  const seven = new Array<Card>(7);

  let equity = 0;
  let win = 0;
  let tie = 0;
  let lose = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const combo = pickCombo(valid, rng);
    const [villainA, villainB] = combo.cards;
    const drawn = pickDistinct(pool, needed, villainA, villainB, rng);

    fullBoard.length = board.length;
    for (const card of drawn) fullBoard.push(card);

    seven[0] = hero[0];
    seven[1] = hero[1];
    for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];
    const heroScore = evaluate7(seven);

    seven[0] = villainA;
    seven[1] = villainB;
    for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];
    const villainScore = evaluate7(seven);

    if (heroScore > villainScore) {
      equity += 1;
      win++;
    } else if (heroScore === villainScore) {
      equity += 0.5;
      tie++;
    } else {
      lose++;
    }
  }

  return {
    equity: equity / iterations,
    win: win / iterations,
    tie: tie / iterations,
    lose: lose / iterations,
    iterations,
  };
}

/** Vytáhne `count` různých karet z poolu, přičemž přeskočí zakázané karty. */
function pickDistinctFromSet(
  pool: readonly Card[],
  count: number,
  banned: ReadonlySet<Card>,
  rng: Rng,
): Card[] {
  if (pool.length - banned.size < count) {
    throw new Error("V balíčku není dost karet na dorozdání");
  }

  const out: Card[] = [];
  while (out.length < count) {
    const card = pool[rng.nextInt(pool.length)];
    if (banned.has(card) || out.includes(card)) continue;
    out.push(card);
  }
  return out;
}

/**
 * Equity proti víc soupeřům, z nichž každý má vlastní range.
 *
 * Tohle je realistický model: soupeř, který raisoval, nemá náhodnou handu.
 * Když se ptáme "jak na tom jsem proti jeho range", dostaneme úplně jiné
 * číslo než proti náhodné handě — a to je rozdíl mezi hrou a hádáním.
 */
export function equityVsRanges(
  hero: readonly Card[],
  ranges: readonly (readonly RangeCombo[])[],
  board: readonly Card[],
  iterations: number,
  rng: Rng,
): EquityResult {
  if (hero.length !== 2) throw new Error("Hrdina musí mít dvě karty");
  if (ranges.length === 0) throw new Error("Musí být aspoň jeden soupeřův range");
  if (iterations <= 0) throw new Error("Počet iterací musí být kladný");
  assertBoard(board);

  const dead = [...hero, ...board];
  assertUnique(dead);

  const valid = ranges.map((range) => filterRange(range, dead));
  for (let index = 0; index < valid.length; index++) {
    if (valid[index].length === 0) {
      throw new Error(`Range soupeře ${index} je po odečtení mrtvých karet prázdný`);
    }
  }

  const fullBoard: Card[] = [...board];
  const seven = new Array<Card>(7);
  const used = new Set<Card>(dead);
  const villainHands: [Card, Card][] = ranges.map(() => [0, 0]);

  let equity = 0;
  let win = 0;
  let tie = 0;
  let lose = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    used.clear();
    for (const card of dead) used.add(card);

    for (let index = 0; index < valid.length; index++) {
      const range = valid[index];
      let combo = pickCombo(range, rng);
      let attempts = 0;

      while ((used.has(combo.cards[0]) || used.has(combo.cards[1])) && attempts < 25) {
        combo = pickCombo(range, rng);
        attempts++;
      }

      if (used.has(combo.cards[0]) || used.has(combo.cards[1])) {
        const fallback = range.find(
          (candidate) => !used.has(candidate.cards[0]) && !used.has(candidate.cards[1]),
        );
        if (!fallback) throw new Error("Range se nedá naplnit bez konfliktu karet");
        combo = fallback;
      }

      villainHands[index][0] = combo.cards[0];
      villainHands[index][1] = combo.cards[1];
      used.add(combo.cards[0]);
      used.add(combo.cards[1]);
    }

    const drawn = pickDistinctFromSet(FULL_DECK, 5 - board.length, used, rng);
    fullBoard.length = board.length;
    for (const card of drawn) fullBoard.push(card);

    seven[0] = hero[0];
    seven[1] = hero[1];
    for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];
    const heroScore = evaluate7(seven);

    let best = heroScore;
    let winners = 1;

    for (const hand of villainHands) {
      seven[0] = hand[0];
      seven[1] = hand[1];
      for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];
      const score = evaluate7(seven);

      if (score > best) {
        best = score;
        winners = 1;
      } else if (score === best) {
        winners++;
      }
    }

    if (heroScore === best) {
      equity += 1 / winners;
      if (winners === 1) win++;
      else tie++;
    } else {
      lose++;
    }
  }

  return {
    equity: equity / iterations,
    win: win / iterations,
    tie: tie / iterations,
    lose: lose / iterations,
    iterations,
  };
}

/**
 * Equity proti `opponents` náhodným handám. Používá se pro rychlý odhad
 * „jak silná je moje handa proti neznámým soupeřům" — například v botovi.
 */
export function equityVsRandom(
  hero: readonly Card[],
  board: readonly Card[],
  opponents: number,
  iterations: number,
  rng: Rng,
): EquityResult {
  if (hero.length !== 2) throw new Error("Hrdina musí mít dvě karty");
  if (opponents < 1) throw new Error("Musí být aspoň jeden soupeř");
  if (iterations <= 0) throw new Error("Počet iterací musí být kladný");
  assertBoard(board);
  assertUnique([...hero, ...board]);

  const known = new Set([...hero, ...board]);
  const pool = FULL_DECK.filter((card) => !known.has(card));
  const boardNeeded = 5 - board.length;
  const totalNeeded = opponents * 2 + boardNeeded;
  const fullBoard: Card[] = [...board];
  const seven = new Array<Card>(7);
  const villainHands: Card[][] = Array.from({ length: opponents }, () => [0, 0]);

  let equity = 0;
  let win = 0;
  let tie = 0;
  let lose = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const drawn = pickDistinct(pool, totalNeeded, -1, -1, rng);

    for (let opponent = 0; opponent < opponents; opponent++) {
      villainHands[opponent][0] = drawn[opponent * 2];
      villainHands[opponent][1] = drawn[opponent * 2 + 1];
    }

    fullBoard.length = board.length;
    for (let i = 0; i < boardNeeded; i++) {
      fullBoard.push(drawn[opponents * 2 + i]);
    }

    seven[0] = hero[0];
    seven[1] = hero[1];
    for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];
    const heroScore = evaluate7(seven);

    let best = heroScore;
    let winners = 1;

    for (const hand of villainHands) {
      seven[0] = hand[0];
      seven[1] = hand[1];
      for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];
      const score = evaluate7(seven);

      if (score > best) {
        best = score;
        winners = 1;
      } else if (score === best) {
        winners++;
      }
    }

    if (heroScore === best) {
      equity += 1 / winners;
      if (winners === 1) win++;
      else tie++;
    } else {
      lose++;
    }
  }

  return {
    equity: equity / iterations,
    win: win / iterations,
    tie: tie / iterations,
    lose: lose / iterations,
    iterations,
  };
}
