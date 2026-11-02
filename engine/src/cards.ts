/**
 * Karty jsou reprezentované jako číslo 0..51.
 *
 *   card = (rank - 2) * 4 + suit
 *   rank = 2..14  (2..10, J=11, Q=12, K=13, A=14)
 *   suit = 0..3   (c, d, h, s)
 *
 * Číselná reprezentace je záměrná: bitové operace, žádné alokace, rychlé testy.
 */

export type Card = number;
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type Suit = 0 | 1 | 2 | 3;

export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "cdhs";

export function makeCard(rank: Rank, suit: Suit): Card {
  return (rank - 2) * 4 + suit;
}

export function rankOf(card: Card): number {
  return (card >> 2) + 2;
}

export function suitOf(card: Card): Suit {
  return (card & 3) as Suit;
}

export function cardToString(card: Card): string {
  return RANK_CHARS[rankOf(card) - 2] + SUIT_CHARS[suitOf(card)];
}

export function cardsToString(cards: readonly Card[]): string {
  return cards.map(cardToString).join(" ");
}

export function parseCard(text: string): Card {
  if (text.length !== 2) throw new Error(`Neplatná karta: "${text}"`);
  const rankIndex = RANK_CHARS.indexOf(text[0].toUpperCase());
  const suitIndex = SUIT_CHARS.indexOf(text[1].toLowerCase());
  if (rankIndex < 0) throw new Error(`Neplatná hodnota karty: "${text}"`);
  if (suitIndex < 0) throw new Error(`Neplatná barva karty: "${text}"`);
  return makeCard((rankIndex + 2) as Rank, suitIndex as Suit);
}

/** "As Kd 7h" -> [karta, karta, karta] */
export function parseCards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseCard);
}

export const FULL_DECK: readonly Card[] = Object.freeze(
  Array.from({ length: 52 }, (_, i) => i),
);

export function rankName(rank: number): string {
  // Desítku zobrazujeme jako "10" — "T" je pro začátečníka matoucí.
  if (rank === 10) return "10";
  return RANK_CHARS[rank - 2] ?? "?";
}
