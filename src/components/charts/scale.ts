/**
 * Pure axis maths for charts — no React, no DOM, so it can be unit tested.
 */

/** Round an axis maximum up to a clean 1 / 2 / 2.5 / 5 × 10ⁿ value. */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}
