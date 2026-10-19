"use client";

/**
 * React Query hooks for suppliers.
 *
 * Mirrors the products/customers hook pattern:
 *   useSuppliers        → list with payable balances
 *   useSupplierSearch   → debounced name/phone search (shares cache with list)
 *   useSupplier         → one supplier with balance
 *   useCreateSupplier / useUpdateSupplier / useDeleteSupplier → mutations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/utils/api-client";
import type { SupplierView, SupplierWithBalance } from "@/lib/services/suppliers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useState } from "react";

export type SupplierDetail = SupplierWithBalance;

export const supplierKeys = {
  all: ["suppliers"] as const,
  list: () => [...supplierKeys.all, "list"] as const,
  search: (query: string) => [...supplierKeys.all, "search", query] as const,
  detail: (id: string) => [...supplierKeys.all, "detail", id] as const,
};

export function useSuppliers() {
  return useQuery<SupplierWithBalance[]>({
    queryKey: supplierKeys.list(),
    queryFn: () => apiGet<SupplierWithBalance[]>("/api/suppliers"),
    staleTime: 60_000,
  });
}

export function useSupplierSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  const result = useQuery<SupplierWithBalance[]>({
    queryKey:
      debouncedQuery.trim() === ""
        ? supplierKeys.list()
        : supplierKeys.search(debouncedQuery),
    queryFn: () => {
      const q = debouncedQuery.trim();
      return apiGet<SupplierWithBalance[]>(
        q ? `/api/suppliers?q=${encodeURIComponent(q)}` : "/api/suppliers",
      );
    },
    staleTime: 30_000,
  });

  return { query, setQuery, debouncedQuery, ...result };
}

export function useSupplier(id: string | null | undefined) {
  return useQuery<SupplierDetail>({
    queryKey: id ? supplierKeys.detail(id) : ["suppliers", "detail", "disabled"],
    queryFn: () => apiGet<SupplierDetail>(`/api/suppliers/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export type SupplierInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  openingBalance?: number;
  nextFollowUpAt?: string | null;
};

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SupplierInput) => apiPost<SupplierView>("/api/suppliers", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.all, refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<SupplierInput>) =>
      apiPatch<SupplierView>(`/api/suppliers/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.detail(id), refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: supplierKeys.list(), refetchType: "active" });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ id: string; deleted: true }>(`/api/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.all, refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
