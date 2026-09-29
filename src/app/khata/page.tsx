"use client";

/**
 * Khata page — list of all customers with live search.
 *
 * Header layout (matches the design spec):
 *   Left:  Khata icon + "Khata" title + "Manage your customers" subtitle
 *   Right: Green pill button "+ Add Customer"
 *
 * Below: search bar + customer list with balance badges + empty states.
 */

import Link from "next/link";
import { Plus, BookOpen } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { KhataList } from "@/components/khata/KhataList";
import { useLanguage } from "@/providers/language-provider";


export default function KhataPage() {
  const { t } = useLanguage();
  return (
    <>
      {/* Page header — icon + title + subtitle on left, action on right.
          Sticky at the top so the search bar below it stays accessible. */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {t("nav.khata")}
            </h1>
            <p className="truncate text-xs text-slate-500">
              {t("nav.khataSubtitle")}
            </p>
          </div>
        </div>
        <Link
          href="/more/customers/new"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition-transform hover:scale-[1.02] active:scale-95"
          aria-label={t("action.addCustomer")}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t("action.addCustomer")}</span>
          <span className="sm:hidden">Add</span>
        </Link>
      </header>
      <ScreenContent>
        <KhataList />
      </ScreenContent>
    </>
  );
}
