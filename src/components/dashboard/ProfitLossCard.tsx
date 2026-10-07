"use client";

/**
 * ProfitLossCard — simple, beautiful P&L summary.
 *
 * Design:
 *   - One big number: Net Profit (green) or Net Loss (red)
 *   - Period tabs: Today / Week / Month / All
 *   - Clean breakdown card:
 *       Revenue
 *      − Cost of Goods
 *      ─────────────
 *       Gross Profit
 *      − Expenses
 *      ─────────────
 *       Net Profit
 *   - Margin badge next to the big number
 *
 * COGS uses batch-level costs when available (batch tracking), otherwise
 * falls back to product.purchasePrice.
 */

import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useProfitLoss } from "@/hooks/use-dashboard";
import { Money } from "@/components/shared/Money";
import { Decimal } from "@/lib/utils/decimal";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import type { ProfitLossPeriod } from "@/lib/services/profit-loss";

type PeriodKey = "today" | "thisWeek" | "thisMonth" | "allTime";

export function ProfitLossCard() {
  const { data, isLoading } = useProfitLoss();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const { t } = useLanguage();

  if (isLoading || !data) {
    return <Skeleton />;
  }

  // Empty state: no revenue at all
  if (new Decimal(data.allTime.revenue).isZero()) {
    return (
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-slate-700">{t("pnl.title")}</h2>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <TrendingUp className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">{t("pnl.noData")}</p>
          <p className="mt-0.5 text-xs text-slate-400">{t("pnl.noDataDesc")}</p>
        </div>
      </section>
    );
  }

  const p = data[period];
  const netProfit = new Decimal(p.netProfit);
  const isProfit = netProfit.gte(0);
  const margin = new Decimal(p.profitMargin);

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-slate-700">{t("pnl.title")}</h2>

      {/* Period tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {([
          { key: "today", label: t("dashboard.today") },
          { key: "thisWeek", label: t("pnl.thisWeek") },
          { key: "thisMonth", label: t("pnl.thisMonth") },
          { key: "allTime", label: t("pnl.allTime") },
        ] as Array<{ key: PeriodKey; label: string }>).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setPeriod(tab.key)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium transition-all",
              period === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Net profit hero */}
      <div
        className={cn(
          "rounded-2xl p-4 text-white shadow-lg",
          isProfit
            ? "bg-gradient-to-br from-brand-600 to-brand-800"
            : "bg-gradient-to-br from-red-500 to-rose-600",
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">
              {isProfit ? t("pnl.netProfit") : t("pnl.netLoss")}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {isProfit ? "" : "−"}
              <Money value={netProfit.abs().toString()} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{t("pnl.margin")}</p>
            <p className="mt-1 text-xl font-bold">{margin.toString()}%</p>
          </div>
        </div>
      </div>

      {/* Breakdown card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Revenue */}
        <Row label={t("pnl.revenue")} value={p.revenue} sub={`${p.salesCount} sales`} tone="blue" />

        {/* COGS */}
        <Row label={t("pnl.cogs")} value={`−${p.cogs}`} tone="amber" />

        {/* Gross Profit subtotal */}
        <div className="border-t-2 border-dashed border-slate-200">
          <Row
            label={t("pnl.grossProfit")}
            value={p.grossProfit}
            tone={new Decimal(p.grossProfit).gte(0) ? "green" : "red"}
            bold
          />
        </div>

        {/* Expenses */}
        <Row label={t("pnl.expenses")} value={`−${p.expenses}`} sub={`${p.expenseCount} expenses`} tone="amber" />

        {/* Net Profit total */}
        <div className="border-t-2 border-slate-300 bg-slate-50">
          <Row
            label={isProfit ? t("pnl.netProfit") : t("pnl.netLoss")}
            value={`${isProfit ? "" : "−"}${netProfit.abs().toString()}`}
            tone={isProfit ? "green" : "red"}
            bold
            large
          />
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Row component — one line in the breakdown
// ────────────────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  sub,
  tone,
  bold = false,
  large = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "green" | "red" | "blue" | "amber";
  bold?: boolean;
  large?: boolean;
}) {
  const valueColor = {
    green: "text-green-600",
    red: "text-red-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
  }[tone];

  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div>
        <p className={cn("text-sm", bold ? "font-semibold text-slate-900" : "font-medium text-slate-600")}>
          {label}
        </p>
        {sub ? <p className="text-[11px] text-slate-400">{sub}</p> : null}
      </div>
      <p className={cn("tabular-nums", valueColor, bold ? "font-bold" : "font-semibold", large ? "text-lg" : "text-sm")}>
        <Money value={value.replace("−", "")} />
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Skeleton
// ────────────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-7 flex-1 animate-pulse rounded-md bg-slate-200" />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
