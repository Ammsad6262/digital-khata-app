/**
 * Money formatting helpers.
 *
 * Currency symbol comes from the Setting table at runtime (see
 * lib/services/settings.ts — to be wired in later phases). For V1 we use
 * the default "Rs." symbol. The format function accepts an explicit symbol
 * so the caller can pass in the configured one.
 */

import { Decimal } from "@/lib/utils/decimal";
import type { Decimal as DecimalValue } from "@/lib/utils/decimal";

const DEFAULT_SYMBOL = "Rs.";

/**
 * Format a money value as "Rs. 1,234.50".
 * Negative amounts render as "-Rs. 1,234.50" so the owner sees the sign clearly.
 */
export function formatMoney(
  value: DecimalValue | string | number | null | undefined,
  symbol: string = DEFAULT_SYMBOL,
): string {
  if (value === null || value === undefined) {
    return `${symbol} 0.00`;
  }
  const d = new Decimal(value);
  const sign = d.lt(0) ? "-" : "";
  const abs = d.abs();
  // Always 2 decimal places, thousands separator.
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${symbol} ${formatted}`;
}

/** Format a quantity (1.5 kg, 3 boxes). 3 decimal places max, trailing zeros stripped. */
export function formatQuantity(
  value: DecimalValue | string | number | null | undefined,
  unit?: string,
): string {
  if (value === null || value === undefined) {
    return unit ? `0 ${unit}` : "0";
  }
  const d = new Decimal(value);
  // Strip trailing zeros but keep at least 1 decimal place if there's a fractional part.
  let str = d.toFixed(3);
  str = str.replace(/\.?0+$/, "");
  return unit ? `${str} ${unit}` : str;
}

/**
 * Parse a money string ("Rs. 1,234.50" or "1234.50" or "1,23,4.5") into a Decimal.
 * Throws on invalid input — caller should catch and show user-friendly error.
 */
export function parseMoney(input: string): Decimal {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || isNaN(Number(cleaned))) {
    throw new Error(`Invalid money value: "${input}"`);
  }
  return new Decimal(cleaned);
}

/** Parse a quantity string into a Decimal. Same parsing logic as parseMoney. */
export function parseQuantity(input: string): Decimal {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || isNaN(Number(cleaned))) {
    throw new Error(`Invalid quantity value: "${input}"`);
  }
  return new Decimal(cleaned);
}
