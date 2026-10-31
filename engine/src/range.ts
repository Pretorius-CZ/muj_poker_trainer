/**
 * Model range — rozsah hand, ne jedna handa.
 *
 * Range je seznam konkrétních kombinací (1326 možných) s váhou. Váha je
 * připravená pro mixed strategie (stejná handa hraná jen z části), zatím
 * se používá 1.
 *
 * Notace, kterou parser umí:
 *
 *   AA            pár (6 kombinací)
 *   AKs           suited (4)
 *   AKo           offsuit (12)
 *   AK            obojí (16)
 *   TT+           TT, JJ, QQ, KK, AA
 *   A2s+          A2s, A3s, ... AKs  (vysoká karta pevná, druhá roste)
 *   KTs+          KTs, KJs, KQs
 *   A5s-A2s       rozsah se stejnou vysokou kartou
 *   99-66         rozsah párů
 *
 * Pravidlo pro "+": vysoká karta zůstává, nízká roste. Proto "T9s+" dá jen
 * T9s — pro spoilery typu T9s+→AKs se vypisují ručně. Je to záměr: radši
 * jednoznačná notace než hádání, co tím kdo myslel.
 */

import type { Card, Rank, Suit } from "./cards.ts";
import { cardToString, makeCard, RANK_CHARS } from "./cards.ts";
import type { Rng } from "./rng.ts";

export type HandType = "pair" | "suited" | "offsuit";

export interface HandClass {
  hi: number;
  lo: number;
  type: HandType;
}

export interface RangeCombo {
  cards: [Card, Card];
  weight: number;
}

function rankValue(char: string): number {
  const index = RANK_CHARS.indexOf(char.toUpperCase());
  if (index < 0) throw new Error(`Neplatná hodnota karty: "${char}"`);
  return index + 2;
}

/** "AKs" → [{hi:14, lo:13, type:"suited"}], "AK" → suited + offsuit. */
export function parseClassToken(text: string): HandClass[] {
  const token = text.toUpperCase();
  if (token.length < 2 || token.length > 3) {
    throw new Error(`Nerozumím handě "${text}"`);
  }

  const first = rankValue(token[0]);
  const second = rankValue(token[1]);
  const suffix = token.length === 3 ? token[2] : "";

  if (first === second) {
    if (suffix) throw new Error(`Pár se nepíše s barvou: "${text}"`);
    return [{ hi: first, lo: first, type: "pair" }];
  }

  if (first < second) {
    throw new Error(`Handa se píše od vyšší karty: "${text}"`);
  }

  if (!suffix) {
    return [
      { hi: first, lo: second, type: "suited" },
      { hi: first, lo: second, type: "offsuit" },
    ];
  }
  if (suffix === "S") return [{ hi: first, lo: second, type: "suited" }];
  if (suffix === "O") return [{ hi: first, lo: second, type: "offsuit" }];
  throw new Error(`Neznámá barva "${suffix}" v "${text}" (čekám s nebo o)`);
}

function expandPlus(start: HandClass): HandClass[] {
  const out: HandClass[] = [];

  if (start.type === "pair") {
    for (let rank = start.hi; rank <= 14; rank++) {
      out.push({ hi: rank, lo: rank, type: "pair" });
    }
    return out;
  }

  for (let lo = start.lo; lo < start.hi; lo++) {
    out.push({ hi: start.hi, lo, type: start.type });
  }
  return out;
}

function expandDash(left: string, right: string): HandClass[] {
  const a = parseClassToken(left);
  const b = parseClassToken(right);

  if (a.length !== 1 || b.length !== 1) {
    throw new Error(`Konce rozsahu musí být konkrétní (např. A5s-A2s), ne "${left}-${right}"`);
  }
  if (a[0].type !== b[0].type) {
    throw new Error(`Konce rozsahu musí být stejný typ: "${left}-${right}"`);
  }

  const from = a[0];
  const to = b[0];
  const out: HandClass[] = [];

  if (from.type === "pair") {
    const low = Math.min(from.hi, to.hi);
    const high = Math.max(from.hi, to.hi);
    for (let rank = low; rank <= high; rank++) {
      out.push({ hi: rank, lo: rank, type: "pair" });
    }
    return out;
  }

  if (from.hi !== to.hi) {
    throw new Error(`Konce rozsahu musí mít stejnou vysokou kartu: "${left}-${right}"`);
  }
  const low = Math.min(from.lo, to.lo);
  const high = Math.max(from.lo, to.lo);
  for (let lo = low; lo <= high; lo++) {
    out.push({ hi: from.hi, lo, type: from.type });
  }
  return out;
}

/** Rozbalí jeden token notace na seznam tříd hand. */
export function expandToken(raw: string): HandClass[] {
  let token = raw.trim();
  if (!token) return [];

  let plus = false;
  if (token.endsWith("+")) {
    plus = true;
    token = token.slice(0, -1).trim();
  }

  const dash = token.indexOf("-");
  if (dash > 0) {
    if (plus) throw new Error(`"+" nejde kombinovat s rozsahem: "${raw}"`);
    return expandDash(token.slice(0, dash).trim(), token.slice(dash + 1).trim());
  }

  const classes = parseClassToken(token);
  return plus ? classes.flatMap(expandPlus) : classes;
}

/** Konkrétní kombinace karet pro třídu hand. */
export function classCombos(handClass: HandClass): [Card, Card][] {
  const out: [Card, Card][] = [];
  const hi = handClass.hi as Rank;
  const lo = handClass.lo as Rank;

  if (handClass.type === "pair") {
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        out.push([makeCard(hi, a as Suit), makeCard(hi, b as Suit)]);
      }
    }
    return out;
  }

  if (handClass.type === "suited") {
    for (let suit = 0; suit < 4; suit++) {
      out.push([makeCard(hi, suit as Suit), makeCard(lo, suit as Suit)]);
    }
    return out;
  }

  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (a === b) continue;
      out.push([makeCard(hi, a as Suit), makeCard(lo, b as Suit)]);
    }
  }
  return out;
}

export function handClassToString(handClass: HandClass): string {
  const hi = RANK_CHARS[handClass.hi - 2];
  const lo = RANK_CHARS[handClass.lo - 2];
  if (handClass.type === "pair") return `${hi}${lo}`;
  return `${hi}${lo}${handClass.type === "suited" ? "s" : "o"}`;
}

function comboKey(a: Card, b: Card): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Z notace udělá konkrétní kombinace karet (bez duplikátů). */
export function parseRange(text: string): RangeCombo[] {
  const tokens = text.split(/[,\s]+/).filter(Boolean);
  const seen = new Map<string, RangeCombo>();

  for (const token of tokens) {
    for (const handClass of expandToken(token)) {
      for (const [a, b] of classCombos(handClass)) {
        seen.set(comboKey(a, b), { cards: [a, b], weight: 1 });
      }
    }
  }

  return [...seen.values()];
}

export function rangeSize(range: readonly RangeCombo[]): number {
  return range.reduce((sum, combo) => sum + combo.weight, 0);
}

export function comboToString(combo: RangeCombo): string {
  return combo.cards.map(cardToString).join("");
}

/** Odebere kombinace, které obsahují mrtvou kartu (board, moje karty). */
export function filterRange(
  range: readonly RangeCombo[],
  dead: readonly Card[],
): RangeCombo[] {
  const deadSet = new Set(dead);
  return range.filter(
    (combo) => !deadSet.has(combo.cards[0]) && !deadSet.has(combo.cards[1]),
  );
}

/** Vážený náhodný výběr kombinace. */
export function pickCombo(range: readonly RangeCombo[], rng: Rng): RangeCombo {
  if (range.length === 0) throw new Error("Nelze vybírat z prázdného range");

  let total = 0;
  for (const combo of range) total += combo.weight;

  let roll = rng.next() * total;
  for (const combo of range) {
    roll -= combo.weight;
    if (roll <= 0) return combo;
  }
  return range[range.length - 1];
}

/** Procentuální zastoupení range v celém prostoru 1326 kombinací. */
export function rangePercent(range: readonly RangeCombo[]): number {
  return (rangeSize(range) / 1326) * 100;
}
