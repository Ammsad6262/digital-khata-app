"use client";

/**
 * Money component — formats a Decimal/string/number as currency.
 *
 * If no `symbol` prop is given, the symbol configured in Settings is used
 * (falling back to "Rs." while settings load). This keeps the symbol
 * consistent on every screen instead of only where a caller remembered to
 * pass it.
 */

import { formatMoney } from "@/lib/utils/money";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";

export function Money({
  value,
  symbol,
  className,
}: {
  value: string | number | null | undefined;
  /** Optional override; defaults to the symbol configured in Settings. */
  symbol?: string;
  className?: string;
}) {
  const configuredSymbol = useCurrencySymbol();
  const resolvedSymbol = symbol ?? configuredSymbol;

  return <span className={className}>{formatMoney(value, resolvedSymbol)}</span>;
}
