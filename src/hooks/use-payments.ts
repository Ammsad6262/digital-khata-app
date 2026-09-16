"use client";

/**
 * React Query hooks for payments.
 *
 * - usePaymentsList  → lightweight list with date filter
 * - useRecentPayments → recent 50 (with customer info)
 * - usePayment       → single payment detail
 * - useRecordPayment → mutation (atomic create)
 * - useVoidPayment   → mutation (void)
 *
 * Overpayment policy (from service layer):
 *   amount > outstanding → ALLOWED (creates advance credit, balance goes negative).
 *   This is intentional — we do not block at the API or hook level.
 *   The UI shows a soft warning before saving, but the owner can proceed.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "@/lib/utils/api-client";
import type {
  PaymentView,
  PaymentListItem,
  PaymentDetail,
  PaymentFilter,
} from "@/lib/services/payments";

// ────────────────────────────────────────────────────────────────────────────
// Query keys
// ────────────────────────────────────────────────────────────────────────────

export const paymentKeys = {
  all: ["payments"] as const,
  lists: () => [...paymentKeys.all, "list"] as const,
  list: (filter: PaymentFilter, customerId?: string) =>
    [...paymentKeys.lists(), { filter, customerId }] as const,
  recent: () => [...paymentKeys.all, "recent"] as const,
  details: () => [...paymentKeys.all, "detail"] as const,
  detail: (id: string) => [...paymentKeys.details(), id] as const,
};

// ────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────

/** Lightweight payments list — used by the Payments list page. */
export function usePaymentsList(filter: PaymentFilter = "all", customerId?: string) {
  return useQuery<PaymentListItem[]>({
    queryKey: paymentKeys.list(filter, customerId),
    queryFn: () => {
      const params = new URLSearchParams({ filter });
      if (customerId) params.set("customerId", customerId);
      return apiGet<PaymentListItem[]>(`/api/payments?${params.toString()}`);
    },
  });
}

/** Recent payments (with customer info) — for dashboards / quick views. */
export function useRecentPayments() {
  return useQuery<PaymentView[]>({
    queryKey: paymentKeys.recent(),
    queryFn: () => apiGet<PaymentView[]>("/api/payments"),
  });
}

/** Single payment detail (with customer info). */
export function usePayment(id: string | null | undefined) {
  return useQuery<PaymentDetail>({
    queryKey: id ? paymentKeys.detail(id) : ["payments", "detail", "disabled"],
    queryFn: () => apiGet<PaymentDetail>(`/api/payments/${id}`),
    enabled: !!id,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

export type RecordPaymentInput = {
  customerId: string;
  saleId?: string | null;
  amount: number | string;
  method: "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other";
  notes?: string | null;
  date?: string;
};

/**
 * Record a payment (atomic — Payment + Transaction ledger row).
 *
 * On success: invalidates payment lists, the specific customer's history,
 * customer lists (balance changed), dashboard (today's payments + receivables
 * may have changed), and the transactions feed.
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      apiPost<PaymentDetail>("/api/payments", input),

    onSuccess: (_data, variables) => {
      // Payment lists (all filters — they all need refresh).
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
      // The specific customer's history + balance.
      queryClient.invalidateQueries({
        queryKey: ["customers", "detail", variables.customerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["customers", "detail", variables.customerId, "history"],
      });
      // Customer lists (balance changed).
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      // Dashboard (today's payments / receivables may have changed).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // Transactions feed.
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

/** Void a payment. Same invalidations as record. */
export function useVoidPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ id: string; voidedAt: string }>(`/api/payments/${id}?action=void`, {}),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export { ApiError };
