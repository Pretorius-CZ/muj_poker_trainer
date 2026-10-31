/**
 * Převody mezi žetony a big blindy pro sázecí panel.
 *
 * U stolu se mluví v BB ("raise na 6 bb"), ne v žetonech. Engine ale počítá
 * v celých žetonech, takže se to musí převádět na jednom místě — jinak se
 * UI a engine rozejdou o zaokrouhlení.
 */

export function bbToChips(bb, bigBlind) {
  return Math.round(bb * bigBlind);
}

export function chipsToBb(chips, bigBlind) {
  return chips / bigBlind;
}

/** "6 bb", "6,5 bb" — česká desetinná čárka. */
export function formatBb(chips, bigBlind) {
  const value = chips / bigBlind;
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(".", ",");
  return `${text} bb`;
}

/** Ořízne "raise to" do legálního rozsahu. */
export function clampRaise(amount, legal) {
  return Math.max(
    legal.minRaiseTo,
    Math.min(legal.maxRaiseTo, Math.round(amount)),
  );
}

/** "+3,5 bb", "−1,2 bb", "0 bb" — se znaménkem. */
export function formatSignedBb(chips, bigBlind) {
  const value = chips / bigBlind;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  const text = Number.isInteger(absolute)
    ? String(absolute)
    : absolute.toFixed(1).replace(".", ",");
  return `${sign}${text} bb`;
}
