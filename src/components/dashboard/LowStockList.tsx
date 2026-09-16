"use client";

/**
 * Low stock list — shows products whose stock is at or below their threshold.
 *
 * Sorted by current stock ascending (most depleted first).
 * Each row is tappable → /stock/[productId] (later phase).
 */

import Link from "next/link";
import { AlertTriangle, Package } from "lucide-react";
import { formatQuantity } from "@/lib/utils/money";
import type { LowStockProduct } from "@/lib/services/dashboard";

export function LowStockList({ products }: { products: LowStockProduct[] }) {
  if (products.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-slate-700">
            Low Stock ({products.length})
          </h2>
        </div>
        <Link
          href="/stock"
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          View all
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50">
        {products.slice(0, 5).map((product, idx) => (
          <Link
            key={product.id}
            href={`/stock`}
            className={idx > 0 ? "border-t border-amber-200/70" : ""}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <Package className="h-4 w-4 text-amber-700" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {product.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Threshold: {product.lowStockThreshold} {product.unit}
                  </p>
                </div>
              </div>
              <div className="ml-2 shrink-0 text-right">
                <p className="text-sm font-bold text-red-600">
                  {formatQuantity(product.currentStock, product.unit)}
                </p>
                <p className="text-[11px] text-red-500">left</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
