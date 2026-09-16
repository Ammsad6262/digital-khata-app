"use client";

/**
 * Money component — formats a Decimal/string/number as currency.
 *
 * Pulls the currency symbol from a prop (the dashboard reads it from
 * settings, but for V1 we default to "Rs.").
 */

import { formatMoney } from "@/lib/utils/money";

export function Money({
  value,
  symbol = "Rs.",
  className,
}: {
  value: string | number | null | undefined;
  symbol?: string;
  className?: string;
}) {
  return <span className={className}>{formatMoney(value, symbol)}</span>;
}
