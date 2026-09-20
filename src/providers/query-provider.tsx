"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query provider with performance-optimized defaults.
 *
 * Performance tuning:
 *   - staleTime 5 minutes — data stays fresh for 5 min, no refetching on
 *     every component mount. This is the #1 cause of "slow" feeling.
 *   - gcTime 10 minutes — keep cache in memory for 10 min for instant back-navigation
 *   - retry 1 — one retry on failure (not the default 3 which feels slow on errors)
 *   - refetchOnWindowFocus false — don't refetch when user switches tabs
 *   - refetchOnMount false — don't refetch if we have cached data
 *   - refetchOnReconnect false — don't refetch when network reconnects
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 10 * 60 * 1000,   // 10 minutes (formerly cacheTime)
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
