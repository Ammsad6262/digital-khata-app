"use client";

/**
 * StockProductPicker — search-driven product selector for stock operations.
 *
 * Similar to the sale's ProductPicker but optimised for stock ops:
 *   - Shows current stock prominently (the operator needs to know this
 *     before adding/adjusting).
 *   - Tap to select (doesn't auto-add line items — stock ops are 1 product).
 */

import { Search, Package, AlertTriangle } from "lucide-react";
import { useProductSearch } from "@/hooks/use-products";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity } from "@/lib/utils/money";
import type { ProductSearchResult } from "@/lib/services/products";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export function StockProductPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (product: ProductSearchResult) => void;
}) {
  const { query, setQuery, data, isLoading, isError } = useProductSearch();
  const { t } = useLanguage();

  return (
    <div className="space-y-2">
      {!selectedId ? (
        <>
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
              placeholder={t("stock.searchPlaceholder")}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              aria-label={t("common.searchProductAria")}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            {isLoading ? (
              <p className="px-2 py-3 text-xs text-slate-400">{t("common.loading")}</p>
            ) : isError ? (
              <p className="px-2 py-3 text-xs text-red-600">{t("common.couldntLoad")}</p>
            ) : !data || data.length === 0 ? (
              query.trim() ? (
                <p className="px-2 py-3 text-xs text-slate-400">
                  {t("product.noProductsMatch")} &ldquo;{query.trim()}&rdquo;.
                </p>
              ) : (
                <p className="px-2 py-3 text-xs text-slate-400">
                  {t("sale.startTypingProduct")}
                </p>
              )
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {data.slice(0, 8).map((product, idx) => {
                  const stock = new Decimal(product.currentStock);
                  const isLow = stock.lte(product.lowStockThreshold);
                  const isNegative = stock.lt(0);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => onSelect(product)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left",
                        idx > 0 ? "border-t border-slate-100" : "",
                        "hover:bg-slate-50",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          isNegative
                            ? "bg-red-100"
                            : isLow
                              ? "bg-amber-100"
                              : "bg-slate-100",
                        )}
                      >
                        {isNegative || isLow ? (
                          <AlertTriangle className={cn(
                            "h-4 w-4",
                            isNegative ? "text-red-600" : "text-amber-600",
                          )} />
                        ) : (
                          <Package className="h-4 w-4 text-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {product.category ?? t("stock.uncategorized")} · {product.unit}
                          {product.sku ? ` · ${product.sku}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "text-xs font-bold tabular-nums",
                            isNegative
                              ? "text-red-600"
                              : isLow
                                ? "text-amber-700"
                                : "text-slate-700",
                          )}
                        >
                          {formatQuantity(stock, product.unit)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
