"use client";

/**
 * ProductDetail — full view of a product with stock movement history.
 *
 * Sections:
 *   1. Stock hero card (big colored number showing current stock)
 *   2. Product info (name, category, SKU, prices)
 *   3. Quick actions (Add Stock / Adjust Stock / Edit)
 *   4. Stock movement history (chronological, with running balance)
 *
 * The movement history includes:
 *   - Stock purchases (positive)
 *   - Stock adjustments (signed ±)
 *   - Sale-induced decrements (negative — these come from SaleItem, not StockMove)
 *
 * For now, this view fetches:
 *   - The product (with current stock)
 *   - StockMove history (purchases + adjustments + returns — NOT sales)
 *
 * Note: SaleItem-based stock reductions aren't in StockMove table by design.
 * They're visible on the Sales list. The history here shows the owner's
 * intentional stock changes (purchases + adjustments).
 */

import Link from "next/link";
import { AlertCircle, Package, ArrowDownToLine, Settings2, Pencil, TrendingUp, TrendingDown } from "lucide-react";
import { useProduct } from "@/hooks/use-products";
import { useStockMovesByProduct } from "@/hooks/use-stock";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity } from "@/lib/utils/money";
import { formatDate, formatTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

export function ProductDetail({ productId }: { productId: string }) {
  const { data: product, isLoading, isError, error, refetch } = useProduct(productId);
  const { data: moves, isLoading: movesLoading } = useStockMovesByProduct(productId);

  if (isLoading) {
    return <ProductDetailSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load product"
        description={error instanceof Error ? error.message : "Something went wrong."}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm">
            Retry
          </Button>
        }
      />
    );
  }

  if (!product) {
    return (
      <EmptyState
        title="Product not found"
        description="This product may have been deleted."
        icon={<AlertCircle className="h-6 w-6" />}
      />
    );
  }

  const stock = new Decimal(product.currentStock);
  const isLow = stock.lte(product.lowStockThreshold);
  const isNegative = stock.lt(0);

  return (
    <div className="space-y-4">
      {/* Stock hero */}
      <div
        className={cn(
          "rounded-2xl p-4 text-white shadow-sm",
          isNegative
            ? "bg-gradient-to-br from-red-500 to-red-600"
            : isLow
              ? "bg-gradient-to-br from-amber-500 to-amber-600"
              : "bg-gradient-to-br from-brand-600 to-brand-700",
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wider opacity-80">
          {isNegative ? "Below zero" : isLow ? "Low stock" : "Current stock"}
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight">
          {formatQuantity(stock, product.unit)}
        </p>
        <p className="mt-1 text-xs opacity-80">
          Threshold: {product.lowStockThreshold} {product.unit}
        </p>
      </div>

      {/* Product info */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h2 className="text-base font-semibold text-slate-900">{product.name}</h2>
        <div className="mt-1 space-y-0.5 text-xs text-slate-500">
          <p>{product.category ?? "Uncategorized"} · {product.unit}</p>
          {product.sku ? <p>SKU: {product.sku}</p> : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Selling price</p>
            <p className="text-sm font-bold text-slate-900">
              <Money value={product.sellingPrice} />
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Purchase price</p>
            <p className="text-sm font-bold text-slate-700">
              <Money value={product.purchasePrice} />
            </p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2">
        <Link href={`/stock/add?productId=${product.id}`}>
          <Button className="w-full" variant="primary" size="md">
            <ArrowDownToLine className="h-4 w-4" />
            Add
          </Button>
        </Link>
        <Link href={`/stock/adjust?productId=${product.id}`}>
          <Button className="w-full" variant="outline" size="md">
            <Settings2 className="h-4 w-4" />
            Adjust
          </Button>
        </Link>
        <Link href={`/more/products/${product.id}/edit`}>
          <Button className="w-full" variant="outline" size="md">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </Link>
      </div>

      {/* Stock movement history */}
      <section className="space-y-2">
        <h3 className="px-1 text-sm font-semibold text-slate-700">
          Stock History
        </h3>

        {movesLoading ? (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : !moves || moves.length === 0 ? (
          <EmptyState
            title="No stock movements yet"
            description="Stock purchases and adjustments will appear here. Sale-based stock reductions are visible on the Sales page."
            icon={<Package className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/* Opening balance row */}
            {new Decimal(product.openingStock).gt(0) ? (
              <MovementRow
                type="opening"
                label="Opening stock"
                quantity={product.openingStock}
                unit={product.unit}
                date={product.createdAt.toISOString()}
                isFirst
              />
            ) : null}

            {moves.map((move, idx) => {
              const isFirst = idx === 0 && new Decimal(product.openingStock).lte(0);
              const qty = new Decimal(move.quantity);
              return (
                <MovementRow
                  key={move.id}
                  type={move.type}
                  label={move.reason || labelForType(move.type)}
                  quantity={qty.toString()}
                  unit={product.unit}
                  date={new Date(move.date).toISOString()}
                  voidedAt={move.voidedAt ? new Date(move.voidedAt).toISOString() : null}
                  isFirst={isFirst}
                />
              );
            })}
          </div>
        )}

        <p className="px-1 text-[11px] text-slate-400">
          Note: Stock reductions from sales aren&apos;t shown here — they appear
          on the Sales page. Use the search box on the Sales tab to filter by
          product.
        </p>
      </section>
    </div>
  );
}

function labelForType(type: string): string {
  switch (type) {
    case "purchase": return "Stock purchase from supplier";
    case "adjustment": return "Stock adjustment";
    case "return": return "Customer return";
    default: return "Stock movement";
  }
}

function MovementRow({
  type,
  label,
  quantity,
  unit,
  date,
  voidedAt,
  isFirst,
}: {
  type: string;
  label: string;
  quantity: string;
  unit: string;
  date: string;
  voidedAt?: string | null;
  isFirst: boolean;
}) {
  const qty = new Decimal(quantity);
  const isPositive = qty.gte(0);
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const isVoided = !!voidedAt;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        !isFirst && "border-t border-slate-100",
        isVoided && "opacity-50",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          isVoided
            ? "bg-slate-100"
            : isPositive
              ? "bg-brand-50"
              : "bg-red-50",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            isVoided
              ? "text-slate-400"
              : isPositive
                ? "text-brand-700"
                : "text-red-600",
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {label}
          {isVoided ? <span className="ml-1.5 text-[10px] font-semibold text-slate-500">(voided)</span> : null}
        </p>
        <p className="text-[11px] text-slate-400">
          {formatDate(new Date(date))} · {formatTime(new Date(date))}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-sm font-bold tabular-nums",
            isVoided
              ? "text-slate-400"
              : isPositive
                ? "text-brand-700"
                : "text-red-600",
          )}
        >
          {isPositive ? "+" : ""}
          {formatQuantity(qty, unit)}
        </p>
        <p className="text-[10px] text-slate-400">
          {type === "opening" ? "start" : type}
        </p>
      </div>
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-200" />
        ))}
      </div>
      <div className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
