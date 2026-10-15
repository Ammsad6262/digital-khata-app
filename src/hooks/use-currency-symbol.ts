"use client";

/**
 * useCurrencySymbol — returns the user's configured currency symbol.
 *
 * Reads from useSettings() (which fetches /api/settings). Falls back to "Rs."
 * while loading or if settings aren't available.
 *
 * Used to replace the 7+ hardcoded "Rs." spans across the app:
 *   - ExpenseForm, AddStockForm, AddPaymentForm, ProductPicker, BatchPicker,
 *     ProductDetail, SmartEntryModal, etc.
 *
 * Usage:
 *   const symbol = useCurrencySymbol();
 *   <span>{symbol} {amount}</span>
 */

import { useSettings } from "@/hooks/use-settings";

const DEFAULT_SYMBOL = "Rs.";

export function useCurrencySymbol(): string {
  const { data } = useSettings();
  return data?.currencySymbol?.trim() || DEFAULT_SYMBOL;
}

/**
 * Static default symbol (for use in non-hook contexts, e.g. formatMoney()).
 * This is "Rs." unless changed in settings.
 */
export const DEFAULT_CURRENCY_SYMBOL = DEFAULT_SYMBOL;
