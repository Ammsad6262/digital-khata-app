"use client";

/**
 * Sales page — list of all sales with date filter chips.
 *
 * Header layout (matches the design spec):
 *   Left:  BarChart3 icon + "Sales" title + "Track and manage your sales" subtitle
 *   Right: Green pill button "+ Add Sale →" with sparkle accents
 *
 * Below: filter chips (Today / This Week / This Month / All) + sales list.
 */

import Link from "next/link";
import { BarChart3, Plus, ArrowRight, Sparkles } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { SalesList } from "@/components/sales/SalesList";
import { useLanguage } from "@/providers/language-provider";


export default function SalesPage() {
  const { t } = useLanguage();
  return (
    <>
      {/* Page header — icon + title + subtitle on left, green "+ Add Sale" pill on right */}
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

        {/* Green pill button "+ Add Sale →" with sparkle accents */}
        <div className="relative shrink-0">
          {/* Sparkle accents on the button */}
          <Sparkles className="absolute -left-2 -top-1.5 h-3 w-3 text-brand-400" aria-hidden />
          <Sparkles className="absolute -left-3 top-1 h-2.5 w-2.5 text-brand-300" aria-hidden />

          <Link
            href="/sales/new"
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition-transform hover:scale-[1.02] active:scale-95"
            aria-label={t("action.newSale")}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Add Sale</span>
            <span className="sm:hidden">Add</span>
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </Link>
        </div>
      </header>
      <ScreenContent>
        <SalesList />
      </ScreenContent>
    </>
  );
}
