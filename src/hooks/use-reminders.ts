"use client";

/**
 * React Query hooks for reminders.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/utils/api-client";
import type {
  ReminderView,
  ReminderCounts,
  ReminderFilter,
} from "@/lib/services/reminders";

export type ReminderListResponse = {
  items: ReminderView[];
  counts: ReminderCounts;
};

export const reminderKeys = {
  all: ["reminders"] as const,
  list: (filter: ReminderFilter) => [...reminderKeys.all, "list", filter] as const,
  detail: (id: string) => [...reminderKeys.all, "detail", id] as const,
};

export function useReminders(filter: ReminderFilter = "all") {
  return useQuery<ReminderListResponse>({
    queryKey: reminderKeys.list(filter),
    queryFn: () => apiGet<ReminderListResponse>(`/api/reminders?filter=${filter}`),
    staleTime: 30_000,
  });
}

export function useReminder(id: string | null | undefined) {
  return useQuery<ReminderView>({
    queryKey: id ? reminderKeys.detail(id) : ["reminders", "detail", "disabled"],
    queryFn: () => apiGet<ReminderView>(`/api/reminders/${id}`),
    enabled: !!id,
  });
}

export type ReminderInput = {
  title: string;
  notes?: string | null;
  type: string;
  dueAt: string;
  priority: string;
  customerId?: string | null;
  supplierId?: string | null;
  productId?: string | null;
};

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: reminderKeys.all, refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["customers"] });
  queryClient.invalidateQueries({ queryKey: ["suppliers"] });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReminderInput) => apiPost<ReminderView>("/api/reminders", input),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useUpdateReminder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ReminderInput>) =>
      apiPatch<ReminderView>(`/api/reminders/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.detail(id), refetchType: "active" });
      invalidateAll(queryClient);
    },
  });
}

export function useSetReminderCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiPatch<ReminderView>(`/api/reminders/${id}`, { completed }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ id: string; deleted: true }>(`/api/reminders/${id}`),
    onSuccess: () => invalidateAll(queryClient),
  });
}
