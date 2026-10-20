"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type { BusinessInsights } from "@/lib/services/insights";

export function useInsights() {
  return useQuery<BusinessInsights>({
    queryKey: ["insights"],
    queryFn: () => apiGet<BusinessInsights>("/api/insights"),
    staleTime: 60_000,
  });
}
