"use client";

/**
 * React Query hooks for payments made TO suppliers.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/utils/api-client";
import type { SupplierPaymentView } from "@/lib/services/supplier-payments";
import { supplierKeys } from "@/hooks/use-suppliers";
import { purchaseKeys } from "@/hooks/use-purchases";

export const supplierPaymentKeys = {
  all: ["supplier-payments"] as const,
  bySupplier: (supplierId: string) =>
    [...supplierPaymentKeys.all, "supplier", supplierId] as const,
};

export function useSupplierPayments(supplierId: string | null | undefined) {
  return useQuery<SupplierPaymentView[]>({
    queryKey: supplierPaymentKeys.bySupplier(supplierId ?? "disabled"),
    queryFn: () =>
      apiGet<SupplierPaymentView[]>(`/api/suppliers/${supplierId}/payments`),
    enabled: !!supplierId,
    staleTime: 30_000,
  });
}

export type CreateSupplierPaymentInput = {
  purchaseId?: string | null;
  amount: number | string;
  method: string;
  notes?: string | null;
  date?: string;
};

export function useCreateSupplierPayment(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierPaymentInput) =>
      apiPost<SupplierPaymentView>(`/api/suppliers/${supplierId}/payments`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: supplierPaymentKeys.bySupplier(supplierId),
        refetchType: "active",
      });
      queryClient.invalidateQueries({
        queryKey: purchaseKeys.bySupplier(supplierId),
        refetchType: "active",
      });
      queryClient.invalidateQueries({ queryKey: supplierKeys.all, refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useVoidSupplierPayment(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      apiDelete<{ id: string; voidedAt: Date }>(`/api/supplier-payments/${paymentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: supplierPaymentKeys.bySupplier(supplierId),
        refetchType: "active",
      });
      queryClient.invalidateQueries({
        queryKey: purchaseKeys.bySupplier(supplierId),
        refetchType: "active",
      });
      queryClient.invalidateQueries({ queryKey: supplierKeys.all, refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
