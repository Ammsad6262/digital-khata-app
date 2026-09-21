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
 *
 * The global QueryProvider sets staleTime=10min and refetchOnMount=false to
 * minimize API calls on high-latency Supabase. That's fine for list/detail
 * pages, but the dashboard is the home screen — users open it specifically
 * to see current numbers. Showing 10-minute-stale data after a sale was
 * recorded is a worse UX than waiting 1 second for a fresh fetch.
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
