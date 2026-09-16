"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query provider.
 *
 * All client-side data fetching goes through React Query — the hooks layer
 * (src/hooks/use-*.ts — to be added in a later phase) wraps these queries.
 *
 * Default config:
 *   - staleTime 30s — fresh enough for daily use, doesn't hammer the API
 *   - retry 1 — one retry on failure, not the default 3
 *   - refetchOnWindowFocus false — too aggressive for a single-user app
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
