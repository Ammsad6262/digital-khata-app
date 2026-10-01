"use client";

/**
 * Stock page — list of all products with current stock levels.
 *
 * Header layout (matches the design spec):
 *   Left:  Package icon + "Stock" title + "Track and manage your inventory" subtitle
 *   Right: "Add" pill button → opens StockAddMenu bottom sheet with 2 options:
 *          - Add Product → /more/products/new
 *          - Add Stock → /stock/add
 *
 * Below: search bar + filter chips (All / In Stock / Low Stock / Out of Stock) +
 * product list with stock levels + low-stock section.
 */

import { Package, Sparkles } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { StockOverview } from "@/components/stock/StockOverview";
import { StockAddMenu } from "@/components/stock/StockAddMenu";
import { useLanguage } from "@/providers/language-provider";


export default function StockPage() {
  const { t } = useLanguage();
  return (
    <>
      {/* Page header — icon + title + subtitle on left, "Add" pill on right */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Package className="h-5 w-5" />
            {/* Small sparkle accent on the icon corner */}
            <Sparkles className="absolute -left-1 -top-1 h-3 w-3 text-brand-300" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {t("nav.stock")}
            </h1>
            <p className="truncate text-xs text-slate-500">
              Track and manage your inventory
            </p>
          </div>
        </div>

        {/* "Add" pill button — opens a bottom sheet with 2 options */}
        <StockAddMenu />
      </header>
      <ScreenContent>
        <StockOverview />
      </ScreenContent>
    </>
  );
}
