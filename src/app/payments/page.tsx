"use client";

/**
 * Payments page — list of all payments with date filter chips.
 *
 * Header layout (matches the design spec):
 *   Left:  Wallet icon + "Payments" title + "Track money received" subtitle
 *   Right: Green pill button "+ Add Payment →"
 */

import Link from "next/link";
import { Wallet, Plus, ArrowRight, Sparkles } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { PaymentsList } from "@/components/payments/PaymentsList";
import { useLanguage } from "@/providers/language-provider";


export default function PaymentsPage() {
  const { t } = useLanguage();
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {t("dashboard.todaysPayments")}
            </h1>
            <p className="truncate text-xs text-slate-500">Track money received</p>
          </div>
        </div>

        <div className="relative shrink-0">
          <Sparkles className="absolute -left-2 -top-1.5 h-3 w-3 text-brand-400" aria-hidden />
          <Sparkles className="absolute -left-3 top-1 h-2.5 w-2.5 text-brand-300" aria-hidden />
          <Link
            href="/payments/new"
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition-transform hover:scale-[1.02] active:scale-95"
            aria-label={t("action.addPayment")}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Add Payment</span>
            <span className="sm:hidden">Add</span>
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </Link>
        </div>
      </header>
      <ScreenContent>
        <PaymentsList />
      </ScreenContent>
    </>
  );
}
