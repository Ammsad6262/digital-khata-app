"use client";

/**
 * React Query hooks for the follow-up workflow.
 *
 * The candidates query is derived from purchase history, so it is only
 * refetched when the owner asks for it (or after a mutation that changes
 * purchase history); follow-ups themselves refresh after each update.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/utils/api-client";
import type {
  FollowUpCandidate,
  FollowUpStats,
  FollowUpView,
  FollowUpOutcome,
} from "@/lib/services/follow-ups";

export type FollowUpFilter = "open" | "resolved" | "all";

export type FollowUpListResponse = {
  items: FollowUpView[];
  stats: FollowUpStats;
};

export const followUpKeys = {
  all: ["follow-ups"] as const,
  list: (filter: FollowUpFilter) => [...followUpKeys.all, "list", filter] as const,
  candidates: [...["follow-ups"], "candidates"] as const,
};

export function useFollowUps(filter: FollowUpFilter = "open") {
  return useQuery<FollowUpListResponse>({
    queryKey: followUpKeys.list(filter),
    queryFn: () => apiGet<FollowUpListResponse>(`/api/follow-ups?filter=${filter}`),
    staleTime: 15_000,
  });
}

export function useFollowUpCandidates() {
  return useQuery<{ items: FollowUpCandidate[] }>({
    queryKey: followUpKeys.candidates,
    queryFn: () => apiGet<{ items: FollowUpCandidate[] }>("/api/follow-ups/candidates"),
    staleTime: 5 * 60_000,
  });
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: followUpKeys.all, refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}

export type CreateFollowUpInput = {
  customerId: string;
  productId?: string | null;
  kind?: "reorder" | "inactive";
  reason: string;
  message: string;
};

export function useCreateFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFollowUpInput) =>
      apiPost<{ followUp: FollowUpView; created: boolean }>("/api/follow-ups", input),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useUpdateFollowUp(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      message?: string;
      outcome?: FollowUpOutcome;
      outcomeNote?: string | null;
    }) => apiPatch<FollowUpView>(`/api/follow-ups/${id}`, input),
    onSuccess: () => invalidateAll(queryClient),
  });
}
