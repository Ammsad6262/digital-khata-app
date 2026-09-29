"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query provider — tuned for multi-device sync.
 *
 * CACHE STRATEGY (multi-device friendly):
 *   - staleTime: 30 seconds — data stays fresh for 30s, then refetches on
 *     next interaction. Short enough that data added on another device
 *     appears within 30s.
 *   - gcTime: 5 minutes — cache kept for 5 min for instant back-nav.
 *   - refetchOnMount: true — refetch when a component mounts if data is
 *     stale. Catches the case where user returns to a page after time
 *     has passed.
 *   - refetchOnWindowFocus: true — CRITICAL for multi-device sync. When
 *     user switches from phone to PC (or returns to the tab), data is
 *     refetched automatically. This is the primary mechanism that makes
 *     data added on phone appear on PC without a manual refresh.
 *   - refetchOnReconnect: true — refetch when network reconnects.
 *   - retry: 1 — retry once on transient errors (network blips).
 *
 * Trade-off: slightly more API calls than the previous aggressive cache
 * (staleTime=10min, refetchOnMount=false). But data sync across devices
 * is more important than saving a few hundred milliseconds per request.
 * The Supabase pooler + circuit breaker handle latency gracefully.
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
            refetchOnWindowFocus: true,     // refetch when user returns to tab
            refetchOnMount: true,           // refetch on mount if stale
            refetchOnReconnect: true,       // refetch on network reconnect
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
