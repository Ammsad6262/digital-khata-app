/**
 * Stock valuation — one definition, used by the stock screen and by reports.
 *
 * Method: each product's on-hand quantity × its recorded purchase price.
 *
 * Rules that matter:
 *   - Only positive stock is valued. Negative stock (a data-entry mistake or an
 *     oversell) must not reduce the value of what is actually on the shelf.
 *   - A product with stock but no purchase price is counted as "not valued"
 *     rather than silently valued at zero, so the UI can say so.
 *   - Money uses Decimal throughout; no float arithmetic.
 *
 * This module is pure and import-safe for client components.
 */

import { Decimal } from "@/lib/utils/decimal";

export type StockValuationInput = {
  currentStock: string | number | Decimal;
  purchasePrice: string | number | Decimal;
};

export type StockValuation = {
  /** Total value of positive stock, 2 decimal places. */
  value: string;
  /** Products with stock > 0 that were valued. */
  valuedProducts: number;
  /** Products with stock > 0 but no purchase price, so left out. */
  unvaluedProducts: number;
  /** Products with any positive stock (valued + unvalued). */
  productsWithStock: number;
};

export function computeStockValuation(items: StockValuationInput[]): StockValuation {
  let value = new Decimal(0);
  let valuedProducts = 0;
  let unvaluedProducts = 0;

  for (const item of items) {
    const quantity = new Decimal(item.currentStock);
    if (quantity.lte(0)) continue;

    const price = new Decimal(item.purchasePrice);
    if (price.lte(0)) {
      unvaluedProducts++;
      continue;
    }

    value = value.plus(quantity.times(price));
    valuedProducts++;
  }

  return {
    value: value.toDecimalPlaces(2).toString(),
    valuedProducts,
    unvaluedProducts,
    productsWithStock: valuedProducts + unvaluedProducts,
  };
}
