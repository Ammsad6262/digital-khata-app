"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query provider.
 *
 * CACHE STRATEGY (financial data):
 *   - staleTime: 30 seconds — the screens feel instant while navigating, but
 *     anything older than half a minute is refreshed in the background.
 *   - gcTime: 5 minutes — cache kept for backward navigation.
 *   - refetchOnMount: true — when a screen is opened with stale data, refetch
 *     in the background (cached data still paints immediately).
 *   - refetchOnWindowFocus: true — coming back to the tab refreshes the numbers.
 *     A shopkeeper who records a payment on one phone and opens the dashboard
 *     on another must not see yesterday's balance.
 *   - refetchOnReconnect: true — refresh after a dropped connection.
 *   - retry: 1 — retry once on transient errors only.
 *
 * Mutations (including the assistant's confirm step) invalidate the affected
 * query keys explicitly, so a new sale/payment/expense appears on every screen
 * without waiting for a poll.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,           // 30 seconds
            gcTime: 5 * 60 * 1000,          // 5 minutes
            retry: 1,
            refetchOnWindowFocus: true,      // refresh when the owner returns
            refetchOnMount: true,            // refresh stale data on navigation
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
