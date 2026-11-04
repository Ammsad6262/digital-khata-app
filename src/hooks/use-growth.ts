"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type { GrowthPlan } from "@/lib/services/growth";
import { useLanguage } from "@/providers/language-provider";

export function useGrowthPlan() {
  const { lang } = useLanguage();
  return useQuery<GrowthPlan>({
    queryKey: ["growth", lang],
    queryFn: () => apiGet<GrowthPlan>(`/api/growth?lang=${lang}`),
    staleTime: 60_000,
  });
}
