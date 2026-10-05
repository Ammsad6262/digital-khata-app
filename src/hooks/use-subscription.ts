"use client";

/**
 * React Query hooks for the subscription system.
 *
 * - useSubscription → fetch current user's subscription status
 * - useRedeemCode   → mutation to redeem an activation code
 * - useRedemptionHistory → fetch user's redemption history
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/utils/api-client";
import type { SubscriptionView, RedeemResult, RedemptionHistoryEntry } from "@/lib/services/subscription";

export const subscriptionKeys = {
  all: ["subscription"] as const,
  detail: () => [...subscriptionKeys.all, "detail"] as const,
  history: () => [...subscriptionKeys.all, "history"] as const,
};

/** Fetch the current user's subscription status. */
export function useSubscription() {
  return useQuery<SubscriptionView>({
    queryKey: subscriptionKeys.detail(),
    queryFn: () => apiGet<SubscriptionView>("/api/subscription"),
    staleTime: 60 * 1000, // 1 minute
    refetchOnMount: true,
  });
}

/** Redeem an activation code. */
export function useRedeemCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) =>
      apiPost<RedeemResult>("/api/subscription/redeem", { code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}

/** Fetch the user's redemption history. */
export function useRedemptionHistory() {
  return useQuery<RedemptionHistoryEntry[]>({
    queryKey: subscriptionKeys.history(),
    queryFn: () => apiGet<RedemptionHistoryEntry[]>("/api/subscription/history"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
