"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/utils/api-client";
import type { Entitlement, LicenseRedeemResult } from "@/lib/services/entitlement";

export const licensingKeys = {
  all: ["licensing"] as const,
  me: () => [...licensingKeys.all, "me"] as const,
};

/** The authenticated customer's authoritative commercial entitlement. */
export function useLicensing() {
  return useQuery<Entitlement>({
    queryKey: licensingKeys.me(),
    queryFn: () => apiGet<Entitlement>("/api/licensing"),
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });
}

/**
 * Redeem any code kind (product / premium / affiliate). Uses the existing
 * `/api/subscription/redeem` endpoint, which delegates to the single
 * entitlement redemption path on the server.
 */
export function useRedeemLicenseCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiPost<LicenseRedeemResult>("/api/subscription/redeem", { code }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: licensingKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}