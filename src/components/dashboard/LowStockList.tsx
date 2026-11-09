"use client";

/**
 * Low stock list — shows products whose stock is at or below their threshold.
 *
 * Sorted by current stock ascending (most depleted first).
 * Each row is tappable → /more/products/[id].
 */

import Link from "next/link";
import { AlertTriangle, Package } from "lucide-react";
import { formatQuantity } from "@/lib/utils/money";
import type { LowStockProduct } from "@/lib/services/dashboard";
import { useLanguage } from "@/providers/language-provider";

export function LowStockList({ products }: { products: LowStockProduct[] }) {
  const { t } = useLanguage();
  if (products.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
            <AlertTriangle className="h-3 w-3" />
          </span>
          <h2 className="section-title">
            {t("dashboard.lowStock")}{" "}
            <span className="font-medium text-ink-faint">({products.length})</span>
          </h2>
        </div>
        <Link
          href="/stock"
          className="text-[11px] font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          {t("dashboard.viewAll")}
        </Link>
      </div>

      <div className="overflow-hidden rounded-card border border-warning/25 bg-warning-soft/50 shadow-card">
        {products.slice(0, 5).map((product, idx) => (
          <Link
            key={product.id}
            href={`/more/products/${product.id}`}
            className={idx > 0 ? "block border-t border-warning/20" : "block"}
          >
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-warning-soft/70">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-warning/15 text-warning-ink">
                  <Package className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {product.name}
                  </p>
                  <p className="text-[10px] text-ink-subtle">
                    {t("product.lowStockThreshold")}: {product.lowStockThreshold}{" "}
                    {product.unit}
                  </p>
                </div>
              </div>
              <div className="ml-2 shrink-0 text-right">
                <p className="text-[13px] font-bold tabular-nums text-danger-ink">
                  {formatQuantity(product.currentStock, product.unit)}
                </p>
                <p className="text-[10px] font-medium text-danger">
                  {t("stock.leftSuffix")}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}