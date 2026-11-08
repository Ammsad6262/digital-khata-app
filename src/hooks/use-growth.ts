"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type { GrowthPlan } from "@/lib/services/growth";

export function useGrowthPlan() {
  return useQuery<GrowthPlan>({
    queryKey: ["growth"],
    queryFn: () => apiGet<GrowthPlan>("/api/growth"),
    staleTime: 60_000,
  });
}
