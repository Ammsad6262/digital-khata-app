/**
 * Decimal helpers — single source of truth for money/quantity math.
 *
 * We use Prisma's `Decimal` type (decimal.js under the hood) everywhere
 * money or quantities are involved. Floating-point math is forbidden for
 * financial values because it can lose precision (0.1 + 0.2 = 0.30000000000000004).
 *
 * Re-export `Decimal` from a single place so all modules import the same
 * constructor and we never accidentally mix `decimal.js` instances.
 */

import { Prisma } from "@prisma/client";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/**
 * Convert any supported value to a Decimal. Throws if the value cannot
 * be parsed — we want loud failures, not silent NaN propagation.
 */
export function toDecimal(
  value: Decimal | string | number | null | undefined,
): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot convert non-finite number to Decimal: ${value}`);
    }
    return new Decimal(value);
  }
  return new Decimal(value);
}

/** Returns 0 if value is null/undefined, otherwise the value as Decimal. */
export function toDecimalOrZero(
  value: Decimal | string | number | null | undefined,
): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  return toDecimal(value);
}

/** Two decimals are equal as money (2dp). */
export function moneyEquals(a: Decimal | string | number, b: Decimal | string | number): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

/** True if `value` is greater than zero. */
export function isPositive(value: Decimal | string | number): boolean {
  return toDecimal(value).gt(0);
}

/** True if `value` is less than zero. */
export function isNegative(value: Decimal | string | number): boolean {
  return toDecimal(value).lt(0);
}
