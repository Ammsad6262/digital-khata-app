"use client";

/**
 * Dashboard client component.
 *
 * Fetches live stats from /api/dashboard via React Query and renders the
 * full dashboard: hero card, stat grid, quick actions, low stock list,
 * recent activity feed.
 *
 * Handles loading (skeleton), error (retry), and empty states.
 */

import { AlertCircle, RefreshCw } from "lucide-react";
import { useDashboard } from "@/hooks/use-dashboard";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { HeroCard } from "@/components/dashboard/HeroCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { LowStockList } from "@/components/dashboard/LowStockList";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import {
  ShoppingCart,
  Wallet,
  Receipt,
  Users,
  Package,
  TrendingUp,
} from "lucide-react";
import { useLanguage } from "@/providers/language-provider";

export function Dashboard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboard();
  const { t } = useLanguage();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <EmptyState
          title={t("common.couldntLoad")}
          description={
            error instanceof Error
              ? error.message
              : t("common.networkError")
          }
          icon={<AlertCircle className="h-6 w-6" />}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
              {t("common.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title={t("dashboard.welcomeTitle")}
        description={t("dashboard.welcomeDesc")}
        icon={<Package className="h-6 w-6" />}
      />
    );
  }

  const isEmpty =
    data.customerCount === 0 &&
    data.recentTransactions.length === 0;

  return (
    <div className="space-y-4">
      {/* Global search — always at the very top for fast access */}
      <GlobalSearch />

      {/* Hero — total receivables */}
      <HeroCard
        totalReceivables={data.totalReceivables}
        customersWithBalance={data.customersWithBalance}
      />

      {/* Quick actions — appear right under hero for fastest access */}
      <QuickActions />

      {/* Today's stats — 2×2 grid */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-700">{t("dashboard.today")}</h2>
          {isFetching ? (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {t("dashboard.updating")}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard
            label={t("dashboard.todaysSales")}
            value={<Money value={data.todaysSales} />}
            icon={ShoppingCart}
            tone="green"
          />
          <StatCard
            label={t("dashboard.todaysPayments")}
            value={<Money value={data.todaysPayments} />}
            icon={Wallet}
            tone="blue"
          />
          <StatCard
            label={t("dashboard.todaysExpenses")}
            value={<Money value={data.todaysExpenses} />}
            icon={Receipt}
            tone="amber"
          />
          <StatCard
            label={t("dashboard.customers")}
            value={String(data.customerCount)}
            icon={Users}
            tone="slate"
          />
        </div>
      </section>

      {/* Low stock alert (only if items exist) */}
      <LowStockList products={data.lowStockProducts} />

      {/* Recent activity */}
      {data.recentTransactions.length > 0 ? (
        <RecentTransactions transactions={data.recentTransactions} />
      ) : isEmpty ? (
        <EmptyState
          title={t("dashboard.welcomeTitle")}
          description={t("dashboard.welcomeDesc")}
          icon={<TrendingUp className="h-6 w-6" />}
        />
      ) : null}
    </div>
  );
}
