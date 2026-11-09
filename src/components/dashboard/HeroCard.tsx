"use client";

/**
 * Hero card — Total Receivables.
 *
 * The most important number on the dashboard. A deep, layered panel with a
 * warm accent glow, a dotted "ledger paper" texture and a compact debtor
 * count pill.
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
  const oweLabel =
    customersWithBalance === 1
      ? t("dashboard.customerOwes")
      : t("dashboard.customersOwe");

  const inner = (
    <>
      {/* warm accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-accent-500/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-12 h-44 w-44 rounded-full bg-surface/10 blur-3xl"
      />
      {/* dotted ledger texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
            {t("dashboard.totalReceivables")}
          </p>
          <p className="mt-2.5 text-[2.15rem] font-extrabold leading-none tracking-[-0.035em] text-white">
            <Money value={totalReceivables} />
          </p>
          <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-surface/10 px-2.5 py-1 text-[11px] font-medium text-white/75 ring-1 ring-white/10">
            <Users className="h-3 w-3" />
            <span className="font-bold text-white">{customersWithBalance}</span>
            <span className="truncate">
              {oweLabel}
            </span>
          </div>
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface/10 text-white ring-1 ring-white/15 backdrop-blur-sm">
          {hasDebtors ? (
            <Users className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
        </div>
      </div>

      {hasDebtors ? (
        <div className="relative mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] font-medium text-white/65">
          <span>{t("dashboard.tapToSeeDetails")}</span>
          <ChevronRight className="h-4 w-4 rtl-flip" />
        </div>
      ) : null}
    </>
  );

  const shell =
    "relative block overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-5 text-white shadow-brand";

  if (hasDebtors) {
    return (
      <Link
        href="/khata/outstanding"
        className={cn(
          shell,
          "transition-all duration-200 hover:shadow-lift active:scale-[0.99]",
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={shell}>{inner}</div>;
}