// GENEROVÁNO z engine/src/cards.ts — neupravuj přímo.
// Znovu vygeneruješ: node tools/build-web.mjs

/**
 * Karty jsou reprezentované jako číslo 0..51.
 *
 *   card = (rank - 2) * 4 + suit
 *   rank = 2..14  (2..10, J=11, Q=12, K=13, A=14)
 *   suit = 0..3   (c, d, h, s)
 *
 * Číselná reprezentace je záměrná: bitové operace, žádné alokace, rychlé testy.
 */

                          
                                                                          
                                 

export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "cdhs";

export function makeCard(rank      , suit      )       {
  return (rank - 2) * 4 + suit;
}

export function rankOf(card      )         {
  return (card >> 2) + 2;
}

export function suitOf(card      )       {
  return (card & 3)        ;
}

export function cardToString(card      )         {
  return RANK_CHARS[rankOf(card) - 2] + SUIT_CHARS[suitOf(card)];
}

export function cardsToString(cards                 )         {
  return cards.map(cardToString).join(" ");
}

export function parseCard(text        )       {
  if (text.length !== 2) throw new Error(`Neplatná karta: "${text}"`);
  const rankIndex = RANK_CHARS.indexOf(text[0].toUpperCase());
  const suitIndex = SUIT_CHARS.indexOf(text[1].toLowerCase());
  if (rankIndex < 0) throw new Error(`Neplatná hodnota karty: "${text}"`);
  if (suitIndex < 0) throw new Error(`Neplatná barva karty: "${text}"`);
  return makeCard((rankIndex + 2)        , suitIndex        );
}

/** "As Kd 7h" -> [karta, karta, karta] */
export function parseCards(text        )         {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseCard);
}

export const FULL_DECK                  = Object.freeze(
  Array.from({ length: 52 }, (_, i) => i),
);

export function rankName(rank        )         {
  // Desítku zobrazujeme jako "10" — "T" je pro začátečníka matoucí.
  if (rank === 10) return "10";
  return RANK_CHARS[rank - 2] ?? "?";
}
