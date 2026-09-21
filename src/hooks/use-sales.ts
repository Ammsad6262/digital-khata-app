"use client";

/**
 * React Query hooks for sales.
 *
 * - useSalesList      → lightweight list (no items) with date filter
 * - useRecentSales    → rich list (with items) for the last 50 sales
 * - useSale           → single sale detail with items + customer
 * - useCreateSale     → create a sale (atomic)
 * - useVoidSale       → void a sale (sets voidedAt)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "@/lib/utils/api-client";
import type {
  SaleWithItems,
  SaleListItem,
  SaleFilter,
} from "@/lib/services/sales";

// ────────────────────────────────────────────────────────────────────────────
// Query keys
// ────────────────────────────────────────────────────────────────────────────

export const saleKeys = {
  all: ["sales"] as const,
  lists: () => [...saleKeys.all, "list"] as const,
  list: (filter: SaleFilter, customerId?: string) =>
    [...saleKeys.lists(), { filter, customerId }] as const,
  recent: () => [...saleKeys.all, "recent"] as const,
  details: () => [...saleKeys.all, "detail"] as const,
  detail: (id: string) => [...saleKeys.details(), id] as const,
};

// ────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────

/** Lightweight sales list (no items) — used by the Sales page. */
export function useSalesList(filter: SaleFilter = "all", customerId?: string) {
  return useQuery<SaleListItem[]>({
    queryKey: saleKeys.list(filter, customerId),
    queryFn: () => {
      const params = new URLSearchParams({ filter });
      if (customerId) params.set("customerId", customerId);
      return apiGet<SaleListItem[]>(`/api/sales?${params.toString()}`);
    },
  });
}

/** Recent sales (with items) — for dashboards, quick overviews. */
export function useRecentSales() {
  return useQuery<SaleWithItems[]>({
    queryKey: saleKeys.recent(),
    queryFn: () => apiGet<SaleWithItems[]>("/api/sales"),
  });
}

/** Single sale detail (with items + customer). */
export function useSale(id: string | null | undefined) {
  return useQuery<SaleWithItems>({
    queryKey: id ? saleKeys.detail(id) : ["sales", "detail", "disabled"],
    queryFn: () => apiGet<SaleWithItems>(`/api/sales/${id}`),
    enabled: !!id,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

export type CreateSaleInput = {
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number | string;
    unitPrice: number | string;
    batchId?: string | null;
  }>;
  paidAmount: number | string;
  paymentMethod?: "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other";
  notes?: string | null;
  date?: string;
};

/**
 * Create a sale (atomic — Sale + SaleItems + Payment + Transaction ledger).
 *
 * On success: invalidates sales lists + customer history + dashboard so
 * all related views refetch with the new data.
 */
export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSaleInput) =>
      apiPost<SaleWithItems>("/api/sales", input),

    onSuccess: (_data, variables) => {
      // Invalidate sales lists (all filters — they all need refresh).
      queryClient.invalidateQueries({ queryKey: saleKeys.lists() });
      // Invalidate the specific customer's history.
      queryClient.invalidateQueries({
        queryKey: ["customers", "detail", variables.customerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["customers", "detail", variables.customerId, "history"],
      });
      // Customer lists (balance changed) + search.
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      // Products (stock changed).
      queryClient.invalidateQueries({ queryKey: ["products"] });
      // Dashboard (today's sales / receivables / low stock may have changed).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // Recent transactions feed.
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

/** Void a sale. Same invalidations as create. */
export function useVoidSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ id: string; voidedAt: string }>(`/api/sales/${id}?action=void`, {}),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: saleKeys.all });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export { ApiError };
