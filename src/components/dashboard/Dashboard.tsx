"use client";

/**
 * Dashboard client component.
 *
 * Fetches live stats from /api/dashboard via React Query and renders the
 * full dashboard: hero card, stat grid, quick actions, low stock list,
 * recent activity feed.
 *
 * Handles loading (skeleton), error (retry), and empty states.
 *
 * PERFORMANCE: prefetches commonly needed data (customers, products) in the
 * background so that when the user navigates to Khata or Stock, the data
 * is already in the React Query cache and appears instantly.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useDashboard } from "@/hooks/use-dashboard";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { Button } from "@/components/ui/Button";
import { HeroCard } from "@/components/dashboard/HeroCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { LowStockList } from "@/components/dashboard/LowStockList";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { ProfitLossCard } from "@/components/dashboard/ProfitLossCard";
import { customerKeys } from "@/hooks/use-customers";
import { productKeys } from "@/hooks/use-products";
import { apiGet } from "@/lib/utils/api-client";
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
  const queryClient = useQueryClient();

  // ── Prefetch commonly needed data in the background ────────────────────────
  // When the user is on the Dashboard, they're likely to navigate to Khata
  // (customers) or Stock (products) next. Prefetch these in the background
  // so the data is already cached when they navigate.
  useEffect(() => {
    // Only prefetch if we have dashboard data (user is logged in + loaded)
    if (!data) return;

    // Prefetch customers WITH balances (used by Khata page)
    queryClient.prefetchQuery({
      queryKey: customerKeys.list(true),
      queryFn: () => apiGet("/api/customers?withBalances=1"),
      staleTime: 120 * 1000,
    });

    // Prefetch products WITH stock (used by Stock page)
    queryClient.prefetchQuery({
      queryKey: productKeys.list(true),
      queryFn: () => apiGet("/api/products?withStock=1"),
      staleTime: 60 * 1000,
    });
  }, [data, queryClient]);

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
    <PullToRefresh onRefresh={async () => { await refetch(); }} className="-mx-4 px-4 sm:-mx-6 sm:px-6">
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

      {/* Profit & Loss — comprehensive P&L with period selector */}
      <ProfitLossCard />

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
    </PullToRefresh>
  );
}
