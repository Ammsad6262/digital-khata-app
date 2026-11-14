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
 *   - refetchOnMount / refetchOnWindowFocus: inherit the global `true`, so
 *     returning to the dashboard re-checks the server instead of showing a
 *     two-minute-old snapshot.
 *   - refetchInterval: 120 seconds.
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
    staleTime: 30 * 1000,       // 30 seconds
    // Inherit the global policy: refetch on mount and on window focus. The old
    // overrides made the home screen keep showing cached numbers after a
    // navigation or a refresh on another device.
    refetchInterval: 120 * 1000, // 2 minutes
  });
}

export function useProfitLoss() {
  return useQuery<ProfitLossStats>({
    queryKey: PROFIT_LOSS_QUERY_KEY,
    queryFn: () => apiGet<ProfitLossStats>("/api/dashboard/profit-loss"),
    staleTime: 30 * 1000,       // 30 seconds
    refetchInterval: 120 * 1000, // 2 minutes
  });
}
