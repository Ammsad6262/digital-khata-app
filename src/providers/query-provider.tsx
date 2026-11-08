"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query provider — optimized for speed.
 *
 * CACHE STRATEGY (performance-tuned):
 *   - staleTime: 60 seconds — data stays fresh for 60s. Long enough that
 *     navigating between pages doesn't trigger unnecessary refetches.
 *     Short enough that financial data stays reasonably current.
 *   - gcTime: 5 minutes — cache kept for 5 min for instant back-nav.
 *   - refetchOnMount: false — DON'T refetch when a component mounts if data
 *     is in cache. The cached data is shown immediately; if stale, a
 *     background refetch happens without blocking the UI.
 *   - refetchOnWindowFocus: false — DON'T refetch when user switches tabs.
 *     This was causing ALL queries to refetch simultaneously on every tab
 *     switch, creating a burst of API calls that froze the UI.
 *   - refetchOnReconnect: true — refetch when network reconnects (rare).
 *   - retry: 1 — retry once on transient errors only.
 *
 * WHY THIS IS FASTER:
 *   Before: staleTime=30s, refetchOnMount=true, refetchOnWindowFocus=true
 *   → Every tab switch = 6+ queries refetching simultaneously
 *   → Every navigation = refetch even if data is 31s old
 *   → UI froze while waiting for all refetches to complete
 *
 *   After: staleTime=60s, refetchOnMount=false, refetchOnWindowFocus=false
 *   → Tab switch = instant (uses cached data)
 *   → Navigation = instant (uses cached data, background refetch if stale)
 *   → Mutations explicitly invalidate only the affected query keys
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,           // 60 seconds (was 30s)
            gcTime: 5 * 60 * 1000,          // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,     // OFF — was causing burst refetches
            refetchOnMount: false,           // OFF — use cached data on mount
            refetchOnReconnect: true,       // ON — refetch when network reconnects
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
