"use client";

/**
 * React Query hook for the dashboard stats.
 *
 * - staleTime 30s (set globally in QueryProvider)
 * - refetchOnWindowFocus disabled (single-user app)
 * - Polls every 60s in the background so the dashboard stays fresh while open
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type { DashboardStats } from "@/lib/services/dashboard";

export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

export function useDashboard() {
  return useQuery<DashboardStats>({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () => apiGet<DashboardStats>("/api/dashboard"),
    refetchInterval: 60 * 1000, // refresh every 60s in background
  });
}
