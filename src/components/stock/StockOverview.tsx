"use client";

/**
 * StockOverview — list of all products with current stock.
 *
 * Features:
 *   - Search bar (filter by name/SKU)
 *   - Filter chips: All / In Stock / Low Stock / Out of Stock
 *   - Each row: product icon, name, category, current stock (color-coded),
 *     low-stock badge if applicable
 *   - Tap → /more/products/[id]
 *   - Low stock summary + total count
 *   - Empty state with "Add product" CTA
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X, Package, AlertTriangle, Plus, PackageCheck, PackageX } from "lucide-react";
import { useProductsWithStock, useProductSearch } from "@/hooks/use-products";
import type { ProductWithStock } from "@/lib/services/products";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { computeStockValuation } from "@/lib/utils/stock-valuation";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

type StockFilter = "all" | "in-stock" | "low-stock" | "out-of-stock";

const FILTERS: Array<{ value: StockFilter; labelKey: string; icon: typeof Package }> = [
  { value: "all", labelKey: "transactions.all", icon: Package },
  { value: "in-stock", labelKey: "stock.inStock", icon: PackageCheck },
  { value: "low-stock", labelKey: "dashboard.lowStock", icon: AlertTriangle },
  { value: "out-of-stock", labelKey: "stock.outOfStock", icon: PackageX },
];

export function StockOverview() {
  const { query, setQuery, data: searchData } = useProductSearch();
  const { data: allProducts, isLoading, isError, error, refetch } = useProductsWithStock();
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();

  // One valuation definition shared with the reports page: positive stock only,
  // at each product's recorded purchase price.
  const valuation = useMemo(
    () => computeStockValuation(allProducts ?? []),
    [allProducts],
  );

  // Combine search results (if query) with all products list.
  const products = useMemo(() => {
    return query.trim() ? (searchData ?? []) : (allProducts ?? []);
  }, [query, searchData, allProducts]);

  const filtered = useMemo(() => {
    if (!products) return [];
    if (stockFilter === "all") return products;
    return products.filter((p) => {
      const stock = new Decimal(p.currentStock);
      const isLow = stock.lte(p.lowStockThreshold) && stock.gt(0);
      const isOut = stock.lte(0);
      if (stockFilter === "in-stock") return stock.gt(p.lowStockThreshold);
      if (stockFilter === "low-stock") return isLow;
      if (stockFilter === "out-of-stock") return isOut;
      return true;
    });
  }, [products, stockFilter]);

  const lowStockCount = useMemo(() => {
    if (!allProducts) return 0;
    return allProducts.filter((p) => {
      const stock = new Decimal(p.currentStock);
      return stock.lte(p.lowStockThreshold) && stock.gt(0);
    }).length;
  }, [allProducts]);

  const outOfStockCount = useMemo(() => {
    if (!allProducts) return 0;
    return allProducts.filter((p) => new Decimal(p.currentStock).lte(0)).length;
  }, [allProducts]);

  return (
    <div className="space-y-3">
      {/* Stock valuation — same method as the reports page */}
      {allProducts && allProducts.length > 0 ? (
        <div className="rounded-card border border-line bg-surface shadow-card p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-subtle">{t("stock.stockValue")}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">
                <Money value={valuation.value} symbol={symbol} />
              </p>
              <p className="mt-0.5 text-[11px] text-ink-subtle">{t("stock.stockValueHint")}</p>
            </div>
            <Link
              href="/more/reports"
              className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-app"
            >
              {t("stock.viewReport")}
            </Link>
          </div>
          {valuation.unvaluedProducts > 0 ? (
            <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[11px] leading-relaxed text-warning-ink">
              {tParams(
                valuation.unvaluedProducts === 1 ? "stock.notValuedOne" : "stock.notValued",
                { count: valuation.unvaluedProducts },
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Search bar */}
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

      {/* Filter chips — All / In Stock / Low Stock / Out of Stock */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const count = f.value === "all" ? (allProducts?.length ?? 0)
            : f.value === "in-stock" ? (allProducts?.filter(p => new Decimal(p.currentStock).gt(p.lowStockThreshold)).length ?? 0)
            : f.value === "low-stock" ? lowStockCount
            : outOfStockCount;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStockFilter(f.value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                stockFilter === f.value
                  ? "bg-brand-600 text-white"
                  : "bg-surface text-ink-muted border border-line hover:bg-app",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(f.labelKey as any)}
              {count > 0 ? (
                <span className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold",
                  stockFilter === f.value ? "bg-surface/20" : "bg-surface-2 text-ink-muted",
                )}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {isLoading ? (
        <StockListSkeleton />
      ) : isError ? (
        <EmptyState
          title={t("common.couldntLoad")}
          description={error instanceof Error ? error.message : t("common.networkError")}
          icon={<AlertTriangle className="h-6 w-6" />}
        />
      ) : !filtered || filtered.length === 0 ? (
        query.trim() ? (
          <EmptyState
            title={t("product.noProductsMatch")}
            description={`${t("stock.noProductsForQueryPrefix")} "${query.trim()}". ${t("stock.noProductsForQuerySuffix")}`}
            icon={<Search className="h-6 w-6" />}
          />
        ) : stockFilter !== "all" ? (
          <EmptyState
            title={stockFilter === "low-stock" ? t("stock.noLowStock") : t("stock.noProductsInFilter")}
            description={stockFilter === "low-stock" ? t("stock.noLowStockDesc") : t("stock.tryDifferentFilter")}
            icon={<Package className="h-6 w-6" />}
          />
        ) : (
          <EmptyStockState />
        )
      ) : (
        <>
          {/* Count header */}
          <div className="flex items-center gap-1.5 px-1">
            <Package className="h-4 w-4 text-ink-faint" />
            <p className="text-xs text-ink-subtle">
              {filtered.length} {filtered.length === 1 ? t("stock.item") : t("stock.items")}
            </p>
          </div>

          {/* Product list */}
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            {filtered.map((product, idx) => (
              <ProductStockRow key={product.id} product={product} isFirst={idx === 0} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProductStockRow({
  product,
  isFirst,
}: {
  product: ProductWithStock;
  isFirst: boolean;
}) {
  const { t } = useLanguage();
  const stock = new Decimal(product.currentStock);
  const isLow = stock.lte(product.lowStockThreshold) && stock.gt(0);
  const isNegative = stock.lt(0);
  const isOut = stock.lte(0);

  return (
    <Link
      href={`/more/products/${product.id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-3 hover:bg-app active:bg-surface-2",
        !isFirst && "border-t border-line",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isNegative || isOut
            ? "bg-danger-soft"
            : isLow
              ? "bg-warning-soft"
              : "bg-surface-2",
        )}
      >
        {isNegative || isOut ? (
          <PackageX className={cn("h-5 w-5", isNegative ? "text-danger-ink" : "text-danger")} />
        ) : isLow ? (
          <AlertTriangle className="h-5 w-5 text-warning-ink" />
        ) : (
          <Package className="h-5 w-5 text-ink-subtle" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {product.name}
        </p>
        <p className="text-[11px] text-ink-subtle">
          {product.category ?? t("stock.uncategorized")} · {product.unit}
          {product.sku ? ` · ${t("product.skuLabel")} ${product.sku}` : ""}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-sm font-bold tabular-nums",
            isNegative || isOut
              ? "text-danger-ink"
              : isLow
                ? "text-warning-ink"
                : "text-ink",
          )}
        >
          {formatQuantity(stock, product.unit)}
        </p>
        {isLow || isOut ? (
          <p className="text-[10px] font-medium text-warning-ink">
            {isNegative ? t("stock.belowZero") : isOut ? t("stock.outOfStock") : t("stock.low")}
          </p>
        ) : (
          <p className="text-[10px] font-medium text-brand-600">{t("stock.inStockLabel")}</p>
        )}
      </div>
    </Link>
  );
}

/**
 * Empty stock state — matches the design pattern used in Khata/Sales.
 */
function EmptyStockState() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-card">
      {/* Icon with badge + sparkles */}
      <div className="relative mb-5">
       
       

        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Package className="h-9 w-9 text-brand-600" strokeWidth={1.75} />
        </div>

        <div className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-brand-600 text-white shadow-card">
          <Plus className="h-4 w-4" strokeWidth={3} />
        </div>
      </div>

      <h3 className="text-base font-semibold text-ink">
        {t("stock.noProducts")}
      </h3>
      <p className="mt-1.5 max-w-xs text-sm text-ink-subtle">
        {t("stock.noProductsDesc")}
      </p>

      <Link
        href="/more/products/new"
        className="mt-6 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-transform hover:scale-[1.02] active:scale-95"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        {t("stock.addProduct")}
      </Link>
    </div>
  );
}

function StockListSkeleton() {
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
            <div className="h-10 w-10 animate-pulse rounded-lg bg-surface-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-surface-2" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
