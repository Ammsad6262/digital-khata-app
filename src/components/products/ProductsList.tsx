"use client";

/**
 * ProductsList — search + list of products.
 *
 * Reuses useProductSearch hook (debounced by name/SKU).
 * Each row shows: name, category, current stock (color-coded), selling price.
 */

import Link from "next/link";
import { Search, X, Package, AlertTriangle, Plus } from "lucide-react";
import { useProductSearch } from "@/hooks/use-products";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity, formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export function ProductsList() {
  const { query, setQuery, data, isLoading, isError, error, refetch } = useProductSearch();
  const { t } = useLanguage();

  const isShortQuery = query.trim().length > 0 && query.trim().length < 2;
  const isEmpty = !data || data.length === 0;

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="sticky top-0 z-10 -mx-4 bg-slate-50 px-4 py-2">
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
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            aria-label="Search products"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {isShortQuery ? (
          <p className="mt-1 pl-1 text-xs text-slate-500">
            {t("customer.keepTyping")}
          </p>
        ) : null}
      </div>

      {/* Body */}
      {isLoading ? (
        <ProductsListSkeleton />
      ) : isError ? (
        <EmptyState
          title={t("common.couldntLoad")}
          description={error instanceof Error ? error.message : t("common.networkError")}
          icon={<Package className="h-6 w-6" />}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              {t("common.retry")}
            </Button>
          }
        />
      ) : isEmpty ? (
        query.trim() ? (
          <EmptyState
            title={t("product.noProductsMatch")}
            description={`No products found for "${query.trim()}".`}
            icon={<Search className="h-6 w-6" />}
            action={
              <Link href="/more/products/new">
                <Button size="sm" variant="outline">
                  {t("stock.addProduct")} &ldquo;{query.trim()}&rdquo;
                </Button>
              </Link>
            }
          />
        ) : (
          <EmptyState
            title={t("product.noProducts")}
            description={t("product.noProductsDesc")}
            icon={<Package className="h-6 w-6" />}
            action={
              <Link href="/more/products/new">
                <Button size="sm">
                  {t("stock.addProduct")}
                </Button>
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-500">
              {query.trim() ? (
                <>
                  {data?.length} {data?.length === 1 ? t("customer.result") : t("customer.results")} {t("customer.for")} &ldquo;{query.trim()}&rdquo;
                </>
              ) : (
                <>
                  {data?.length} {data?.length === 1 ? t("product.productName") : t("more.products")} {t("customer.total")}
                </>
              )}
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {data?.map((product, idx) => (
              <Link
                key={product.id}
                href={`/more/products/${product.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 hover:bg-slate-50 active:bg-slate-100",
                  idx > 0 && "border-t border-slate-100",
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    new Decimal(product.currentStock).lt(0)
                      ? "bg-red-100"
                      : new Decimal(product.currentStock).lte(product.lowStockThreshold)
                        ? "bg-amber-100"
                        : "bg-slate-100",
                  )}
                >
                  {new Decimal(product.currentStock).lt(0) ||
                  new Decimal(product.currentStock).lte(product.lowStockThreshold) ? (
                    <AlertTriangle className={cn(
                      "h-5 w-5",
                      new Decimal(product.currentStock).lt(0)
                        ? "text-red-600"
                        : "text-amber-600",
                    )} />
                  ) : (
                    <Package className="h-5 w-5 text-slate-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {product.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {product.category ?? t("stock.uncategorized")} · {formatMoney(product.sellingPrice)} / {product.unit}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      new Decimal(product.currentStock).lt(0)
                        ? "text-red-600"
                        : new Decimal(product.currentStock).lte(product.lowStockThreshold)
                          ? "text-amber-700"
                          : "text-slate-900",
                    )}
                  >
                    {formatQuantity(product.currentStock, product.unit)}
                  </p>
                  <p className="text-[10px] text-slate-400">{t("stock.inStock")}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Floating add button */}
      {!isEmpty && !isError ? (
        <Link
          href="/more/products/new"
          className="fixed bottom-20 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-transform hover:scale-105 active:scale-95"
          style={{ right: "max(1rem, calc((100vw - 480px) / 2 + 1rem))" }}
          aria-label="Add product"
        >
          <Plus className="h-5 w-5" />
        </Link>
      ) : null}
    </div>
  );
}

function ProductsListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 px-3 py-3",
              i > 0 && "border-t border-slate-100",
            )}
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-slate-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-3 w-12 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
