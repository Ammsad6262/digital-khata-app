/**
 * Compact money formatting for chart labels.
 *
 * Chart labels need to stay readable in a narrow column; the exact figure is
 * always available in the surrounding table/list. The minus sign is U+2212 so
 * negatives align and read as a sign, not a hyphen.
 */
export function compactMoney(value: number, symbol: string): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    return `${sign}${symbol}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  }
  if (abs >= 1_000) {
    return `${sign}${symbol}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  }
  return `${sign}${symbol}${abs.toFixed(0)}`;
}