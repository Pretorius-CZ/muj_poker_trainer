/**
 * Dělení potu na main pot a side poty.
 *
 * Algoritmus je "vrstvený": seřadím unikátní výše vkladů a pro každou vrstvu
 * spočítám, kdo do ní přispěl a kdo na ni má nárok. Tím se správně vyřeší:
 *   - víc all-inů najednou,
 *   - vrácení nevolané části sázky (vrstva, na kterou má nárok jen jeden hráč),
 *   - žetony složené foldnutými hráči (přispívají, ale nemají nárok).
 */

export interface PotContribution {
  seat: number;
  /** Celkem vloženo do potu v této handě (všechny streets). */
  amount: number;
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Seaty, které mají nárok na tento pot (foldnutí ne). */
  eligible: number[];
  /** Jaká výše vkladu tento pot ohraničuje (pro debug a review). */
  cap: number;
}

export function buildPots(contributions: readonly PotContribution[]): Pot[] {
  const positive = contributions.filter((c) => c.amount > 0);
  if (positive.length === 0) return [];

  const levels = [...new Set(positive.map((c) => c.amount))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let previous = 0;

  for (const level of levels) {
    const increment = level - previous;
    const contributors = positive.filter((c) => c.amount >= level);
    const amount = increment * contributors.length;
    if (amount > 0) {
      pots.push({
        amount,
        eligible: contributors.filter((c) => !c.folded).map((c) => c.seat),
        cap: level,
      });
    }
    previous = level;
  }

  return pots;
}
