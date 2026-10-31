/**
 * Deterministický RNG (mulberry32).
 *
 * Proč vlastní RNG a ne Math.random: každá handa musí být přehratelná ze seedu.
 * To je základ review režimu — "tuhle handu si zahraj znovu" musí dát přesně
 * stejné karty.
 */

export interface Rng {
  /** Uzavřené číslo v <0, 1). */
  next(): number;
  /** Celé číslo v <0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Aktuální stav — pro uložení / obnovení pozice v náhodné sekvenci. */
  readonly seed: number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const nextUint32 = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  const next = (): number => nextUint32() / 4294967296;

  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`nextInt čeká kladné celé číslo, dostal ${maxExclusive}`);
    }
    // Odmítnutí vzorků, aby rozdělení nebylo zkreslené modulo biasem.
    const limit = 4294967296 - (4294967296 % maxExclusive);
    let value = nextUint32();
    while (value >= limit) value = nextUint32();
    return value % maxExclusive;
  };

  return { next, nextInt, seed };
}

/** Fisher-Yates, in-place. */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}
