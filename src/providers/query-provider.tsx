"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query provider with aggressive caching for high-latency DB.
 *
 * Since Supabase is in Mumbai and Vercel is in US-East, every API call
 * has ~500ms latency. We minimize calls by:
 *   - staleTime: 10 minutes — data stays fresh for 10 min
 *   - gcTime: 30 minutes — cache kept for 30 min for instant back-nav
 *   - refetchOnMount: false — never refetch on mount if we have cache
 *   - refetchOnWindowFocus: false — don't refetch when switching tabs
 *   - refetchOnReconnect: false — don't refetch on network changes
 *   - retry: 0 — don't retry (retry adds latency on errors)
 *   - placeholderData: keepPreviousData — show old data while fetching new
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 60 * 1000, // 10 minutes
            gcTime: 30 * 60 * 1000,    // 30 minutes
            retry: 0,
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
