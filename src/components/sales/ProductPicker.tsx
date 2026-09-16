"use client";

/**
 * ProductPicker — search-driven product selector for the New Sale form.
 *
 * Shows the search results as a list. Tapping a product adds it as a line
 * item (the parent owns the line-items array; we just call onAdd).
 *
 * Each result shows:
 *   - Product name + SKU
 *   - Current stock (with low-stock badge if applicable)
 *   - Default selling price (will be pre-filled in the line item)
 *
 * If the product is already in the cart (line items), we show "Added" and
 * disable the button to prevent duplicates.
 */

import { Search, Plus, Package, Check, AlertTriangle } from "lucide-react";
import { useProductSearch } from "@/hooks/use-products";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity, formatMoney } from "@/lib/utils/money";
import type { ProductSearchResult } from "@/lib/services/products";

export function ProductPicker({
  alreadyAddedProductIds,
  onAdd,
}: {
  alreadyAddedProductIds: Set<string>;
  onAdd: (product: ProductSearchResult) => void;
}) {
  const { query, setQuery, data, isLoading, isError } = useProductSearch();

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search product by name or SKU..."
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          aria-label="Search product"
        />
      </div>

      <div className="space-y-1">
        {isLoading ? (
          <p className="px-2 py-3 text-xs text-slate-400">Searching...</p>
        ) : isError ? (
          <p className="px-2 py-3 text-xs text-red-600">Failed to load products.</p>
        ) : !data || data.length === 0 ? (
          query.trim() ? (
            <p className="px-2 py-3 text-xs text-slate-400">
              No products match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <p className="px-2 py-3 text-xs text-slate-400">
              Start typing to search products...
            </p>
          )
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {data.slice(0, 6).map((product, idx) => {
              const alreadyAdded = alreadyAddedProductIds.has(product.id);
              const stock = new Decimal(product.currentStock);
              const isLowStock = stock.lte(product.lowStockThreshold);
              const isNegative = stock.lt(0);

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => !alreadyAdded && onAdd(product)}
                  disabled={alreadyAdded}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                    idx > 0 ? "border-t border-slate-100" : ""
                  } ${alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Package className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {product.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          isNegative
                            ? "text-red-600 font-medium"
                            : isLowStock
                              ? "text-amber-600 font-medium"
                              : "text-slate-500"
                        }
                      >
                        {isNegative ? (
                          <span className="inline-flex items-center gap-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            {formatQuantity(stock, product.unit)} (negative)
                          </span>
                        ) : (
                          <span>Stock: {formatQuantity(stock, product.unit)}</span>
                        )}
                      </span>
                      {product.sku ? (
                        <span className="text-slate-400">· {product.sku}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-slate-700">
                      {formatMoney(product.sellingPrice)}
                    </p>
                    <p className="text-[10px] text-slate-400">per {product.unit}</p>
                  </div>
                  <div className="shrink-0">
                    {alreadyAdded ? (
                      <Check className="h-4 w-4 text-brand-600" />
                    ) : (
                      <Plus className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
