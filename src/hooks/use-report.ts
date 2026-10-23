"use client";

/**
 * useReport — fetch /api/reports for a preset or a custom date window.
 *
 * The window is part of the query key, so switching periods never shows the
 * previous period's numbers under the new heading.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type { ReportData } from "@/lib/services/reports";

export type ReportQuery =
  | { kind: "preset"; preset: string }
  | { kind: "custom"; from: string; to: string };

export function reportQueryString(query: ReportQuery): string {
  return query.kind === "preset"
    ? `?preset=${encodeURIComponent(query.preset)}`
    : `?from=${encodeURIComponent(query.from)}&to=${encodeURIComponent(query.to)}`;
}

export function useReport(query: ReportQuery) {
  return useQuery<ReportData>({
    queryKey: ["report", query],
    queryFn: () => apiGet<ReportData>(`/api/reports${reportQueryString(query)}`),
    staleTime: 30_000,
  });
}
