"use client";

/**
 * Money component — formats a Decimal/string/number as currency.
 *
 * Uses the caller's symbol when given, otherwise the symbol the owner configured
 * in Settings (falling back to "Rs." while it loads). This fixes screens that
 * used to render "Rs." even after the owner chose a different currency.
 */

import { formatMoney } from "@/lib/utils/money";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";

export function Money({
  value,
  symbol,
  className,
}: {
  value: string | number | null | undefined;
  symbol?: string;
  className?: string;
}) {
  const configured = useCurrencySymbol();
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatMoney(value, symbol ?? configured)}
    </span>
  );
}