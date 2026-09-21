"use client";

/**
 * React Query hook for the dashboard stats.
 *
 * IMPORTANT — overrides the global cache settings:
 *   - staleTime: 0            → always consider data stale
 *   - refetchOnMount: true     → ALWAYS refetch when Dashboard mounts
 *
 * The global QueryProvider sets staleTime=10min and refetchOnMount=false to
 * minimize API calls on high-latency Supabase. That's fine for list/detail
 * pages, but the dashboard is the home screen — users open it specifically
 * to see current balances. Showing 10-minute-stale "3 customers owe you
 * 500" after a sale was recorded is a worse UX than waiting 1 second for
 * a fresh fetch. So we override here.
 *
 * Background polling every 60s also stays on so the number ticks up live
 * while the dashboard is open.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type { DashboardStats } from "@/lib/services/dashboard";

export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

export function useDashboard() {
  return useQuery<DashboardStats>({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () => apiGet<DashboardStats>("/api/dashboard"),
    staleTime: 0,                 // always stale → always refetch when refetched
    refetchOnMount: true,         // always refetch when Dashboard mounts
    refetchOnWindowFocus: true,   // refetch when user returns to the tab
    refetchInterval: 60 * 1000,   // refresh every 60s in background
  });
}
