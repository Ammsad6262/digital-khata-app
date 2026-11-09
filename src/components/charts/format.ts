/**
 * Compact money formatting for chart labels and value axes.
 *
 * Chart labels need to stay readable in a narrow column; the exact figure is
 * always available in the surrounding table/list. The minus sign is U+2212 so
 * negatives align and read as a sign, not a hyphen.
 */

/** "1.0" → "1", "1.5" → "1.5" — keep labels tight. */
function trimTrailingZero(value: string): string {
  return value.replace(/\.0$/, "");
}

export function compactMoney(value: number, symbol: string): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";

  if (abs >= 1_000_000) {
    return `${sign}${symbol}${trimTrailingZero(
      (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1),
    )}m`;
  }

  if (abs >= 1_000) {
    // Roll values that round up to 1000k over to millions so we never print
    // "Rs.1000k" for a figure just under a million.
    if (abs >= 999_500) {
      return `${sign}${symbol}${trimTrailingZero((abs / 1_000_000).toFixed(1))}m`;
    }
    return `${sign}${symbol}${trimTrailingZero(
      (abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1),
    )}k`;
  }

  return `${sign}${symbol}${abs.toFixed(0)}`;
}
