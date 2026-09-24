"use client";

/**
 * useAuth — hooks for account management.
 *
 * - useCurrentUser  → fetch /api/account (profile data)
 * - useUpdateProfile → PATCH /api/account (name, email)
 * - useChangePassword → PATCH /api/account/password
 * - useDeleteAccount → DELETE /api/account (requires password)
 * - useLogout       → POST /api/auth/logout
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiDelete, apiPost, ApiError } from "@/lib/utils/api-client";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};

/** Fetch the current user's profile. */
export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: authKeys.me(),
    queryFn: () => apiGet<CurrentUser>("/api/account"),
    staleTime: 0,
    refetchOnMount: true,
  });
}

/** Update profile (name and/or email). */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name?: string; email?: string }) =>
      apiPatch<CurrentUser>("/api/account", input),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me(), user);
    },
  });
}

/** Change password. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiPatch<{ changed: boolean }>("/api/account/password", input),
  });
}

/** Delete account + all data. Requires password confirmation. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { password: string }) =>
      apiDelete<{ deleted: boolean }>("/api/account", input),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/login";
    },
  });
}

/** Logout. */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost<{ loggedOut: boolean }>("/api/auth/logout", {}),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/login";
    },
  });
}

export { ApiError };
