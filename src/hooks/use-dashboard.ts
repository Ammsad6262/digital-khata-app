"use client";

/**
 * React Query hooks for the dashboard.
 *
 * - useDashboard       → main stats (receivables, today's sales/payments/expenses, low stock)
 * - useProfitLoss     → comprehensive P&L (revenue, COGS, gross/net profit, margin) for 4 periods
 *
 * Both override the global cache settings:
 *   - staleTime: 0            → always consider data stale
 *   - refetchOnMount: true     → ALWAYS refetch when Dashboard mounts
 *   - refetchOnWindowFocus: true → refetch when user returns to the tab
 *   - refetchInterval: 60s     → auto-refresh every 60 seconds
 *
 * The global QueryProvider sets staleTime=30s + refetchOnWindowFocus=true
 * for multi-device sync. The dashboard goes further: staleTime=0 means
 * it ALWAYS refetches on mount/focus, and refetchInterval polls every 60s.
 * The dashboard is the home screen — users open it to see current numbers.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type { DashboardStats } from "@/lib/services/dashboard";
import type { ProfitLossStats } from "@/lib/services/profit-loss";

export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;
export const PROFIT_LOSS_QUERY_KEY = ["dashboard", "profit-loss"] as const;

export function useDashboard() {
  return useQuery<DashboardStats>({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () => apiGet<DashboardStats>("/api/dashboard"),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
  });
}

export function useProfitLoss() {
  return useQuery<ProfitLossStats>({
    queryKey: PROFIT_LOSS_QUERY_KEY,
    queryFn: () => apiGet<ProfitLossStats>("/api/dashboard/profit-loss"),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
  });
}
