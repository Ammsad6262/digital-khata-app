"use client";

/**
 * ProfitLossCard — a calm, statement-style profit & loss summary.
 *
 * Design:
 *   - Segmented period control: Today / Week / Month / All
 *   - One clear net number (success green or danger red)
 *   - Margin pill + a composition bar (profit / cost / expenses)
 *   - A receipt-like breakdown: Revenue → COGS → Gross → Expenses → Net
 *
 * COGS uses batch-level costs when available (batch tracking), otherwise
 * falls back to product.purchasePrice.
 */

import { useState } from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useProfitLoss } from "@/hooks/use-dashboard";
import { Money } from "@/components/shared/Money";
import { Decimal } from "@/lib/utils/decimal";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

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
        <h2 className="section-title px-1">{t("pnl.title")}</h2>
        <div className="rounded-card border border-dashed border-line-strong bg-surface p-7 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-ink-faint">
            <TrendingUp className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[13px] font-semibold text-ink-muted">
            {t("pnl.noData")}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">{t("pnl.noDataDesc")}</p>
        </div>
      </section>
    );
  }

  const p = data[period];
  const netProfit = new Decimal(p.netProfit);
  const isProfit = netProfit.gte(0);
  const margin = new Decimal(p.profitMargin);

  // Composition bar (only when there is revenue to divide)
  const revenue = new Decimal(p.revenue);
  const cogs = new Decimal(p.cogs);
  const expenses = new Decimal(p.expenses);
  const hasRevenue = revenue.gt(0);
  const pct = (v: Decimal) =>
    hasRevenue
      ? Math.max(0, Math.min(100, v.div(revenue).mul(100).toNumber()))
      : 0;
  const cogsPct = pct(cogs);
  const expPct = pct(expenses);
  const profitPct = Math.max(0, 100 - cogsPct - expPct);

  return (
    <section className="space-y-2">
      <h2 className="section-title px-1">{t("pnl.title")}</h2>

      {/* Period tabs */}
      <div className="flex gap-1 rounded-control bg-surface-2 p-1">
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
              "flex-1 rounded-[0.6rem] py-1.5 text-[11px] font-semibold transition-all duration-150",
              period === tab.key
                ? "bg-surface text-ink shadow-soft"
                : "text-ink-subtle hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Net profit summary */}
      <div className="relative overflow-hidden rounded-card border border-line bg-surface shadow-card p-4 shadow-card">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full blur-3xl",
            isProfit ? "bg-brand-500/15" : "bg-danger/15",
          )}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              {isProfit ? t("pnl.netProfit") : t("pnl.netLoss")}
            </p>
            <p
              className={cn(
                "mt-1.5 truncate text-[1.85rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums",
                isProfit ? "text-success-ink" : "text-danger-ink",
              )}
            >
              {isProfit ? "" : "−"}
              <Money value={netProfit.abs().toString()} />
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={cn(
                "pill",
                isProfit
                  ? "bg-success-soft text-success-ink"
                  : "bg-danger-soft text-danger-ink",
              )}
            >
              {isProfit ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {margin.toNumber().toFixed(0)}%
            </span>
            <span className="text-[10px] text-ink-faint">{t("pnl.margin")}</span>
          </div>
        </div>

        {/* Composition bar */}
        {hasRevenue ? (
          <div className="relative mt-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
              <span
                className="h-full bg-brand-500"
                style={{ width: `${profitPct}%` }}
                title={t("pnl.netProfit")}
              />
              <span
                className="h-full bg-accent-400"
                style={{ width: `${cogsPct}%` }}
                title={t("pnl.cogs")}
              />
              <span
                className="h-full bg-warning"
                style={{ width: `${expPct}%` }}
                title={t("pnl.expenses")}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-ink-subtle">
              <LegendDot className="bg-brand-500" label={t("pnl.netProfit")} />
              <LegendDot className="bg-accent-400" label={t("pnl.cogs")} />
              <LegendDot className="bg-warning" label={t("pnl.expenses")} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Breakdown card */}
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card shadow-card">
        <Row
          label={t("pnl.revenue")}
          value={p.revenue}
          sub={`${p.salesCount} ${t("transactions.sales")}`}
          tone="info"
        />
        <Row label={t("pnl.cogs")} value={p.cogs} tone="accent" sign="−" />
        <div className="border-t border-dashed border-line-strong/70">
          <Row
            label={t("pnl.grossProfit")}
            value={p.grossProfit}
            tone={new Decimal(p.grossProfit).gte(0) ? "success" : "danger"}
            bold
          />
        </div>
        <Row
          label={t("pnl.expenses")}
          value={p.expenses}
          sub={`${p.expenseCount} ${t("transactions.expenses")}`}
          tone="accent"
          sign="−"
        />
        <div className="border-t border-line bg-surface-2/60">
          <Row
            label={isProfit ? t("pnl.netProfit") : t("pnl.netLoss")}
            value={netProfit.abs().toString()}
            tone={isProfit ? "success" : "danger"}
            bold
            large
            sign={isProfit ? "" : "−"}
          />
        </div>
      </div>

      {/* Honest caveat: this is a computed estimate, not an audited profit. */}
      <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
        {t("pnl.estimateNote")}{" "}
        <Link
          href="/more/reports"
          className="font-semibold text-brand-600 underline-offset-2 hover:underline"
        >
          {t("pnl.fullReport")}
        </Link>
      </p>
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
  sign = "",
  bold = false,
  large = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "success" | "danger" | "info" | "accent";
  sign?: string;
  bold?: boolean;
  large?: boolean;
}) {
  const valueColor = {
    success: "text-success-ink",
    danger: "text-danger-ink",
    info: "text-info-ink",
    accent: "text-accent-700",
  }[tone];

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p
          className={cn(
            "text-[13px]",
            bold ? "font-semibold text-ink" : "font-medium text-ink-muted",
          )}
        >
          {label}
        </p>
        {sub ? <p className="text-[10px] text-ink-faint">{sub}</p> : null}
      </div>
      <p
        className={cn(
          "shrink-0 tabular-nums",
          valueColor,
          bold ? "font-bold" : "font-semibold",
          large ? "text-[17px]" : "text-[13px]",
        )}
      >
        {sign}
        <Money value={value} />
      </p>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", className)} />
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Skeleton
// ────────────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
      <div className="flex gap-1 rounded-control bg-surface-2 p-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-7 flex-1 animate-pulse rounded-md bg-surface-3" />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-card bg-surface-2" />
      <div className="space-y-1 overflow-hidden rounded-card border border-line bg-surface shadow-card p-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded bg-surface-2" />
        ))}
      </div>
    </div>
  );
}