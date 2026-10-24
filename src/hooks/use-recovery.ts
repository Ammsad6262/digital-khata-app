"use client";

/**
 * React Query hooks for the payment-recovery workflow.
 *
 * The list is derived from open sales, so it is refreshed after any contact
 * log, reminder, or payment. Logging a contact never changes the balance.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/utils/api-client";
import type {
  RecoveryContactInput,
  RecoveryFilter,
  RecoveryResult,
} from "@/lib/services/recovery";

export const recoveryKeys = {
  all: ["recovery"] as const,
  list: (filter: RecoveryFilter) =>
    [...recoveryKeys.all, "list", filter] as const,
};

export function useRecovery(filter: RecoveryFilter = "all") {
  return useQuery<RecoveryResult>({
    queryKey: recoveryKeys.list(filter),
    queryFn: () => apiGet<RecoveryResult>(`/api/recovery?filter=${filter}`),
    staleTime: 15_000,
  });
}

function invalidateAfterContact(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: recoveryKeys.all, refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["reminders"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["customers"] });
}

export function useLogRecoveryContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecoveryContactInput) =>
      apiPost<{ id: string; completedAt: string }>("/api/recovery/contact", input),
    onSuccess: () => {
      invalidateAfterContact(queryClient);
    },
  });
}

export function useCreateRecoveryReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { customerId: string; days?: number }) =>
      apiPost<{ id: string; dueAt: string }>("/api/recovery/remind", input),
    onSuccess: () => {
      invalidateAfterContact(queryClient);
    },
  });
}
