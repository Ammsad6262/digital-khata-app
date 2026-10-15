"use client";

/**
 * /expenses — the main Expenses page (V2: bottom-nav entry point).
 *
 * Header layout:
 *   Left:  Receipt icon + "Expenses" title + "Track and manage your business
 *          expenses" subtitle
 *   Right: "+ Add Expense" pill + global More button
 *
 * Body: ExpensesOverview component (period filter + summary cards +
 * category breakdown + recent list).
 */

import Link from "next/link";
import { Receipt, Plus, ArrowRight, Sparkles } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { ExpensesOverview } from "@/components/expenses/ExpensesOverview";
import { MoreButton } from "@/components/layout/MoreButton";
import { useLanguage } from "@/providers/language-provider";

export default function ExpensesPage() {
  const { t } = useLanguage();
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {t("nav.expenses")}
            </h1>
            <p className="truncate text-xs text-slate-500">
              {t("nav.expensesSubtitle")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="relative">
            <Sparkles className="absolute -left-2 -top-1.5 h-3 w-3 text-brand-400" aria-hidden />
            <Link
              href="/more/expenses/new"
              className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition-transform hover:scale-[1.02] active:scale-95"
              aria-label={t("action.addExpense")}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">{t("action.addExpense")}</span>
              <span className="sm:hidden">{t("common.add")}</span>
              <ArrowRight className="hidden h-4 w-4 rtl-flip sm:inline" strokeWidth={2.25} />
            </Link>
          </div>
          <MoreButton />
        </div>
      </header>
      <ScreenContent>
        <ExpensesOverview />
      </ScreenContent>
    </>
  );
}
