"use client";

/**
 * ProfitLossCard — comprehensive P&L section for the dashboard.
 *
 * Features:
 *   - Period selector: Today / This Week / This Month / All Time
 *   - Big net profit number (green if profit, red if loss)
 *   - Profit margin %
 *   - Full breakdown: Revenue → COGS → Gross Profit → Expenses → Net Profit
 *   - Sales count + expense count for the selected period
 *   - Loading skeleton, error state, empty state
 *
 * COGS (Cost of Goods Sold) is computed as:
 *   For each SaleItem: quantity × (batch.unitCost OR product.purchasePrice OR 0)
 * This means profit is accurately tracked per-batch (e.g. if you bought
 * sugar at Rs. 50/kg last week and Rs. 60/kg this week, the system
 * knows which batch each sale came from and uses the right cost).
 */

import { useState } from "react";
import { AlertCircle, TrendingDown, TrendingUp, Wallet, RefreshCw } from "lucide-react";
import { useProfitLoss } from "@/hooks/use-dashboard";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import type { ProfitLossPeriod } from "@/lib/services/profit-loss";

type PeriodKey = "today" | "thisWeek" | "thisMonth" | "allTime";

export function ProfitLossCard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useProfitLoss();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const { t } = useLanguage();

  if (isLoading) {
    return <ProfitLossSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        title={t("pnl.couldntLoad")}
        description={error instanceof Error ? error.message : t("common.networkError")}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  if (!data) return null;

  const current = data[period];

  // Empty state: no sales at all (all-time revenue = 0)
  if (new Decimal(data.allTime.revenue).isZero()) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-700">{t("pnl.title")}</h2>
        </div>
        <EmptyState
          title={t("pnl.noData")}
          description={t("pnl.noDataDesc")}
          icon={<TrendingUp className="h-6 w-6" />}
        />
      </section>
    );
  }

  return (
    <section className="space-y-2">
      {/* Header + period selector */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-slate-700">{t("pnl.title")}</h2>
        {isFetching ? (
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {t("dashboard.updating")}
          </span>
        ) : null}
      </div>

      {/* Period chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {([
          { key: "today", label: t("dashboard.today") },
          { key: "thisWeek", label: t("pnl.thisWeek") },
          { key: "thisMonth", label: t("pnl.thisMonth") },
          { key: "allTime", label: t("pnl.allTime") },
        ] as Array<{ key: PeriodKey; label: string }>).map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              period === p.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Net profit hero */}
      <NetProfitHero period={current} />

      {/* Breakdown rows */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <BreakdownRow
          label={t("pnl.revenue")}
          value={current.revenue}
          tone="blue"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          subtitle={`${current.salesCount} ${current.salesCount === 1 ? t("pnl.sales").toLowerCase() : t("pnl.sales").toLowerCase()}`}
        />
        <BreakdownRow
          label={t("pnl.cogs")}
          value={`-${current.cogs}`}
          tone="amber"
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          isSubtracted
        />
        <BreakdownRow
          label={t("pnl.grossProfit")}
          value={current.grossProfit}
          tone={new Decimal(current.grossProfit).gte(0) ? "green" : "red"}
          icon={<Wallet className="h-3.5 w-3.5" />}
          isEmphasized
          isSubtotal
        />
        <BreakdownRow
          label={t("pnl.expenses")}
          value={`-${current.expenses}`}
          tone="amber"
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          subtitle={`${current.expenseCount} ${current.expenseCount === 1 ? "expense" : "expenses"}`}
          isSubtracted
        />
        <BreakdownRow
          label={t("pnl.netProfit")}
          value={current.netProfit}
          tone={new Decimal(current.netProfit).gte(0) ? "green" : "red"}
          icon={new Decimal(current.netProfit).gte(0) ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          isEmphasized
          isTotal
        />
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Net profit hero — the big number at the top
// ────────────────────────────────────────────────────────────────────────────

function NetProfitHero({ period }: { period: ProfitLossPeriod }) {
  const { t } = useLanguage();
  const netProfit = new Decimal(period.netProfit);
  const isProfit = netProfit.gte(0);
  const margin = new Decimal(period.profitMargin);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl p-4 text-white shadow-lg",
        isProfit
          ? "bg-gradient-to-br from-green-600 to-emerald-700 shadow-green-600/20"
          : "bg-gradient-to-br from-red-600 to-rose-700 shadow-red-600/20",
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">
            {isProfit ? t("pnl.netProfit") : t("pnl.netLoss")}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {isProfit ? "" : "−"}
            <Money value={netProfit.abs().toString()} />
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="rounded bg-white/20 px-1.5 py-0.5 font-semibold">
              {t("pnl.margin")}: {margin.toString()}%
            </span>
            <span className="opacity-80">
              {t("pnl.revenue")}: <Money value={period.revenue} />
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-white/15 p-2 backdrop-blur-sm">
          {isProfit ? (
            <TrendingUp className="h-5 w-5" />
          ) : (
            <TrendingDown className="h-5 w-5" />
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Breakdown row — one line in the P&L breakdown card
// ────────────────────────────────────────────────────────────────────────────

function BreakdownRow({
  label,
  value,
  tone,
  icon,
  subtitle,
  isSubtotal = false,
  isTotal = false,
  isEmphasized = false,
  isSubtracted = false,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "blue" | "amber";
  icon: React.ReactNode;
  subtitle?: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  isEmphasized?: boolean;
  isSubtracted?: boolean;
}) {
  const toneClasses = {
    green: "text-green-700",
    red: "text-red-600",
    blue: "text-blue-700",
    amber: "text-amber-700",
  }[tone];

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        isTotal && "bg-slate-50",
        isSubtotal && "border-t border-slate-100",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn(
          "truncate text-sm",
          isEmphasized ? "font-semibold text-slate-900" : "font-medium text-slate-700",
        )}>
          {label}
        </p>
        {subtitle ? (
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        ) : null}
      </div>
      <p className={cn(
        "shrink-0 text-sm font-bold tabular-nums",
        toneClasses,
        isEmphasized && "text-base",
      )}>
        <Money value={value.replace("-", "")} />
        {isSubtracted ? <span className="ml-0.5 opacity-60">−</span> : null}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ────────────────────────────────────────────────────────────────────────────

function ProfitLossSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-slate-200" />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
