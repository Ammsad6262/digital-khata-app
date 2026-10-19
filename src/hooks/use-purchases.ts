"use client";

/**
 * React Query hooks for purchases (stock bought from suppliers).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/utils/api-client";
import type { PurchaseView } from "@/lib/services/purchases";
import { supplierKeys } from "@/hooks/use-suppliers";

export const purchaseKeys = {
  all: ["purchases"] as const,
  bySupplier: (supplierId: string) =>
    [...purchaseKeys.all, "supplier", supplierId] as const,
};

export function usePurchasesBySupplier(supplierId: string | null | undefined) {
  return useQuery<PurchaseView[]>({
    queryKey: purchaseKeys.bySupplier(supplierId ?? "disabled"),
    queryFn: () =>
      apiGet<PurchaseView[]>(`/api/suppliers/${supplierId}/purchases`),
    enabled: !!supplierId,
    staleTime: 30_000,
  });
}

export type PurchaseItemInput = {
  productId: string;
  quantity: number | string;
  unitCost: number | string;
  batchName?: string | null;
};

export type CreatePurchaseInput = {
  items: PurchaseItemInput[];
  paidAmount: number | string;
  notes?: string | null;
  date?: string;
};

export function useCreatePurchase(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseInput) =>
      apiPost<PurchaseView>(`/api/suppliers/${supplierId}/purchases`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: purchaseKeys.bySupplier(supplierId),
        refetchType: "active",
      });
      queryClient.invalidateQueries({ queryKey: supplierKeys.all, refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["products"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useVoidPurchase(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (purchaseId: string) =>
      apiDelete<{ id: string; voidedAt: Date }>(`/api/purchases/${purchaseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: purchaseKeys.bySupplier(supplierId),
        refetchType: "active",
      });
      queryClient.invalidateQueries({ queryKey: supplierKeys.all, refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["products"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
