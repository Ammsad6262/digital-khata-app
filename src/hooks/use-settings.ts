"use client";

/**
 * React Query hooks for settings.
 *
 * - useSettings        → fetch current settings
 * - useUpdateSettings  → mutation (update business name / currency)
 * - useSetPin          → mutation (set or change PIN)
 * - useRemovePin       → mutation (remove PIN lock)
 * - useClearAllData    → mutation (danger zone — wipes all data)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/utils/api-client";
import type { SettingView } from "@/lib/services/settings";

export const settingsKeys = {
  all: ["settings"] as const,
  detail: () => [...settingsKeys.all, "detail"] as const,
};

export function useSettings() {
  return useQuery<SettingView>({
    queryKey: settingsKeys.detail(),
    queryFn: () => apiGet<SettingView>("/api/settings"),
  });
}

type UpdateSettingsInput = {
  businessName?: string | null;
  currency?: string;
  currencySymbol?: string;
  timezone?: string;
  customUnits?: string[];
};

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSettingsInput) =>
      apiPatch<SettingView>("/api/settings", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function useSetPin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pin, currentPin }: { pin: string; currentPin?: string }) =>
      apiPost<{ hasPin: boolean }>("/api/settings/pin", { pin, currentPin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function useRemovePin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ currentPin }: { currentPin: string }) =>
      apiDelete<{ hasPin: boolean }>("/api/settings/pin", { currentPin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function useClearAllData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ confirm, currentPin }: { confirm: boolean; currentPin?: string }) =>
      apiDelete<{ deleted: Record<string, number> }>("/api/settings/clear-all", {
        confirm,
        currentPin,
      }),
    onSuccess: () => {
      // Invalidate everything — all data is gone
      queryClient.invalidateQueries();
    },
  });
}

export { ApiError };
