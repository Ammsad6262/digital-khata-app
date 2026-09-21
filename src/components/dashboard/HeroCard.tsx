"use client";

/**
 * Hero card — Total Receivables.
 *
 * The most important number on the dashboard. Big, green, prominent.
 * Shows the total amount customers owe + how many customers have balances.
 *
 * The card is CLICKABLE when at least one customer owes money — tapping it
 * navigates to /khata/outstanding, which lists every customer who owes
 * money along with their individual balance, lifetime totals, last
 * activity, and a link into each customer's full khata (ledger).
 *
 * When no one owes money, the card still displays (showing Rs. 0) but is
 * not clickable — there's nothing to drill into.
 */

import Link from "next/link";
import { CheckCircle2, ChevronRight, Users } from "lucide-react";
import { Money } from "@/components/shared/Money";
import { useLanguage } from "@/providers/language-provider";
import { cn } from "@/lib/utils/cn";

export function HeroCard({
  totalReceivables,
  customersWithBalance,
}: {
  totalReceivables: string;
  customersWithBalance: number;
}) {
  const { t } = useLanguage();
  const hasDebtors = customersWithBalance > 0;

  // The inner content — same whether the card is a link or a plain div.
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-100">
            {t("dashboard.totalReceivables")}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            <Money value={totalReceivables} />
          </p>
          <p className="mt-3 text-xs text-brand-100">
            <span className="font-semibold text-white">
              {customersWithBalance}
            </span>{" "}
            {customersWithBalance === 1
              ? t("dashboard.customerOwes")
              : t("dashboard.customersOwe")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-xl bg-white/15 p-2 backdrop-blur-sm">
            {hasDebtors ? (
              <Users className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
          </div>
        </div>
      </div>
      {/* Tap hint — only shown when there's something to drill into */}
      {hasDebtors ? (
        <div className="mt-3 flex items-center gap-1 border-t border-white/15 pt-2 text-[11px] text-brand-100/90">
          <span>{t("dashboard.tapToSeeDetails")}</span>
          <ChevronRight className="h-3 w-3" />
        </div>
      ) : null}
    </>
  );

  // Clickable card → /khata/outstanding when there's at least one debtor.
  // Plain (non-interactive) card otherwise.
  if (hasDebtors) {
    return (
      <Link
        href="/khata/outstanding"
        aria-label={`${customersWithBalance} ${customersWithBalance === 1 ? t("dashboard.customerOwes") : t("dashboard.customersOwe")} ${t("outstanding.totalOwed").toLowerCase()}: ${totalReceivables}`}
        className={cn(
          "block overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg shadow-brand-600/20",
          "transition-all hover:shadow-xl hover:shadow-brand-600/30 active:scale-[0.99]",
        )}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg shadow-brand-600/20">
      {inner}
    </div>
  );
}
