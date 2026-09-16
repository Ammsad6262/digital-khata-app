"use client";

/**
 * StockOverview — list of all products with current stock.
 *
 * Features:
 *   - Search bar (filter by name/SKU)
 *   - "Low Stock" section (filtered view) — products at or below threshold
 *   - "All Products" section — sorted by name
 *   - Each row: product icon, name, category, current stock (color-coded),
 *     low-stock badge if applicable
 *   - Tap → /more/products/[id]
 *   - Floating action: + Add Stock (top right of header → /stock/add)
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X, Package, AlertTriangle, Plus, ArrowDownToLine, Settings2 } from "lucide-react";
import { useProductsWithStock, useProductSearch } from "@/hooks/use-products";
import type { ProductWithStock } from "@/lib/services/products";
import { EmptyState } from "@/components/shared/EmptyState";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

export function StockOverview() {
  const { query, setQuery, data: searchData } = useProductSearch();
  const { data: allProducts, isLoading, isError, error } = useProductsWithStock();
  const [showLowOnly, setShowLowOnly] = useState(false);

  // Combine search results (if query) with all products list.
  const products = useMemo(() => {
    return query.trim() ? (searchData ?? []) : (allProducts ?? []);
  }, [query, searchData, allProducts]);

  const filtered = useMemo(() => {
    if (!showLowOnly) return products;
    return products.filter((p) => new Decimal(p.currentStock).lte(p.lowStockThreshold));
  }, [products, showLowOnly]);

  const lowStockCount = useMemo(() => {
    if (!allProducts) return 0;
    return allProducts.filter((p) => new Decimal(p.currentStock).lte(p.lowStockThreshold)).length;
  }, [allProducts]);

  return (
    <div className="space-y-3">
      {/* Search bar */}
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

      {/* Filter toggle + low stock count */}
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => setShowLowOnly(!showLowOnly)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            showLowOnly
              ? "bg-red-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50",
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Low stock
          {lowStockCount > 0 ? (
            <span className={cn(
              "rounded-full px-1.5 text-[10px] font-bold",
              showLowOnly ? "bg-white/20" : "bg-red-100 text-red-700",
            )}>
              {lowStockCount}
            </span>
          ) : null}
        </button>

        <Link
          href="/stock/add"
          className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          Add Stock
        </Link>
      </div>

      {/* Body */}
      {isLoading ? (
        <StockListSkeleton />
      ) : isError ? (
        <EmptyState
          title="Couldn't load products"
          description={error instanceof Error ? error.message : "Something went wrong."}
          icon={<Package className="h-6 w-6" />}
        />
      ) : !filtered || filtered.length === 0 ? (
        query.trim() ? (
          <EmptyState
            title="No products match"
            description={`No products found for "${query.trim()}". Try a different name or SKU.`}
            icon={<Search className="h-6 w-6" />}
          />
        ) : showLowOnly ? (
          <EmptyState
            title="No low-stock items"
            description="All products are above their low-stock thresholds."
            icon={<Package className="h-6 w-6" />}
          />
        ) : (
          <EmptyState
            title="No products yet"
            description="Add your first product to start tracking stock. Products are needed to record sales."
            icon={<Package className="h-6 w-6" />}
            action={
              <Link href="/more/products/new">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700">
                  <Plus className="h-4 w-4" />
                  Add product
                </span>
              </Link>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.map((product, idx) => (
            <ProductStockRow key={product.id} product={product} isFirst={idx === 0} />
          ))}
        </div>
      )}

      {/* Adjust stock link */}
      {!isLoading && filtered && filtered.length > 0 ? (
        <Link
          href="/stock/adjust"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Adjust stock (recount / write-off)
        </Link>
      ) : null}
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
  const stock = new Decimal(product.currentStock);
  const isLow = stock.lte(product.lowStockThreshold);
  const isNegative = stock.lt(0);

  return (
    <Link
      href={`/more/products/${product.id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-3 hover:bg-slate-50 active:bg-slate-100",
        !isFirst && "border-t border-slate-100",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isNegative
            ? "bg-red-100"
            : isLow
              ? "bg-amber-100"
              : "bg-slate-100",
        )}
      >
        {isNegative || isLow ? (
          <AlertTriangle className={cn(
            "h-5 w-5",
            isNegative ? "text-red-600" : "text-amber-600",
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
          {product.category ?? "Uncategorized"} · {product.unit}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-sm font-bold tabular-nums",
            isNegative
              ? "text-red-600"
              : isLow
                ? "text-amber-700"
                : "text-slate-900",
          )}
        >
          {formatQuantity(stock, product.unit)}
        </p>
        {isLow ? (
          <p className="text-[10px] font-medium text-amber-600">
            {isNegative ? "below zero" : "low"}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function StockListSkeleton() {
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
            <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-3 w-12 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
