"use client";

/**
 * Sales page — list of all sales with date filter chips.
 *
 * Header layout (matches the design spec):
 *   Left:  BarChart3 icon + "Sales" title + "Track and manage your sales" subtitle
 *   Right: (no button — the floating QuickAdd FAB is shown on this page)
 *
 * Below: filter chips (Today / This Week / This Month / All) + sales list.
 */

import { BarChart3 } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { SalesList } from "@/components/sales/SalesList";
import { useLanguage } from "@/providers/language-provider";


export default function SalesPage() {
  const { t } = useLanguage();
  return (
    <>
      {/* Page header — icon + title + subtitle on left.
          No action button on the right because the floating QuickAdd FAB is
          already shown on the Sales page (the most common action here is
          recording a new sale, which the FAB provides with one tap). */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {t("nav.sales")}
            </h1>
            <p className="truncate text-xs text-slate-500">
              {t("nav.salesSubtitle")}
            </p>
          </div>
        </div>
      </header>
      <ScreenContent>
        <SalesList />
      </ScreenContent>
    </>
  );
}
