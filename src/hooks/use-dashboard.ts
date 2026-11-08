"use client";

/**
 * React Query hooks for the dashboard.
 *
 * - useDashboard       → main stats (receivables, today's sales/payments/expenses, low stock)
 * - useProfitLoss     → comprehensive P&L (revenue, COGS, gross/net profit, margin) for 4 periods
 *
 * PERFORMANCE-TUNED CACHE SETTINGS:
 *   - staleTime: 30 seconds — data stays fresh for 30s. This prevents
 *     unnecessary refetches when navigating between dashboard and other
 *     pages (which happens frequently). 30s is short enough for financial
 *     data to be reasonably current.
 *   - refetchOnMount: false — use cached data on mount. The global config
 *     already does a background refetch if data is stale.
 *   - refetchOnWindowFocus: false — the global config handles this.
 *   - refetchInterval: 120 seconds (was 60s) — auto-refresh every 2 minutes.
 *     60s was too aggressive — caused 2 API calls per minute even when
 *     the user was just reading the dashboard.
 *
 * The dashboard is still the freshest data in the app — 30s staleTime +
 * 120s polling is a good balance between freshness and performance.
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
    staleTime: 30 * 1000,       // 30 seconds (was 0)
    refetchOnMount: false,        // use cached data (was true)
    refetchOnWindowFocus: false, // global handles this (was true)
    refetchInterval: 120 * 1000, // 2 minutes (was 1 minute)
  });
}

export function useProfitLoss() {
  return useQuery<ProfitLossStats>({
    queryKey: PROFIT_LOSS_QUERY_KEY,
    queryFn: () => apiGet<ProfitLossStats>("/api/dashboard/profit-loss"),
    staleTime: 30 * 1000,       // 30 seconds (was 0)
    refetchOnMount: false,        // use cached data (was true)
    refetchOnWindowFocus: false, // global handles this (was true)
    refetchInterval: 120 * 1000, // 2 minutes (was 1 minute)
  });
}
