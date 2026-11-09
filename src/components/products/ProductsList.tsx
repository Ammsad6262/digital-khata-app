"use client";

/**
 * ProductsList — search + list of products.
 *
 * Reuses useProductSearch hook (debounced by name/SKU).
 * Each row shows: name, category, current stock (color-coded), selling price.
 */

import Link from "next/link";
import { Search, X, Package, AlertTriangle } from "lucide-react";
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
      <div className="sticky top-0 z-10 -mx-4 bg-app px-4 py-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("stock.searchPlaceholder")}
            className="w-full rounded-lg border border-line-strong bg-surface py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            aria-label={t("common.searchProductsAria")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint hover:text-ink-muted"
              aria-label={t("common.clearSearchAria")}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {isShortQuery ? (
          <p className="mt-1 pl-1 text-xs text-ink-subtle">
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
            description={`${t("stock.noProductsForQueryPrefix")} "${query.trim()}". ${t("stock.noProductsForQuerySuffix")}`}
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
            <p className="text-xs text-ink-subtle">
              {query.trim() ? (
                <>
                  {data?.length} {data?.length === 1 ? t("customer.result") : t("customer.results")} {t("customer.for")} &ldquo;{query.trim()}&rdquo;
                </>
              ) : (
                <>
                  {data?.length} {data?.length === 1 ? t("product.product") : t("more.products")} {t("customer.total")}
                </>
              )}
            </p>
          </div>
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            {data?.map((product, idx) => (
              <Link
                key={product.id}
                href={`/more/products/${product.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 hover:bg-app active:bg-surface-2",
                  idx > 0 && "border-t border-line",
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    new Decimal(product.currentStock).lt(0)
                      ? "bg-danger-soft"
                      : new Decimal(product.currentStock).lte(product.lowStockThreshold)
                        ? "bg-warning-soft"
                        : "bg-surface-2",
                  )}
                >
                  {new Decimal(product.currentStock).lt(0) ||
                  new Decimal(product.currentStock).lte(product.lowStockThreshold) ? (
                    <AlertTriangle className={cn(
                      "h-5 w-5",
                      new Decimal(product.currentStock).lt(0)
                        ? "text-danger-ink"
                        : "text-warning-ink",
                    )} />
                  ) : (
                    <Package className="h-5 w-5 text-ink-subtle" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {product.name}
                  </p>
                  <p className="text-[11px] text-ink-subtle">
                    {product.category ?? t("stock.uncategorized")} · {formatMoney(product.sellingPrice)} / {product.unit}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      new Decimal(product.currentStock).lt(0)
                        ? "text-danger-ink"
                        : new Decimal(product.currentStock).lte(product.lowStockThreshold)
                          ? "text-warning-ink"
                          : "text-ink",
                    )}
                  >
                    {formatQuantity(product.currentStock, product.unit)}
                  </p>
                  <p className="text-[10px] text-ink-faint">{t("stock.inStock")}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProductsListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 px-3 py-3",
              i > 0 && "border-t border-line",
            )}
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
