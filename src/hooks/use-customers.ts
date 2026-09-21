"use client";

/**
 * React Query hooks for customers.
 *
 * - useCustomers       → list (optionally with balances)
 * - useCustomerSearch  → debounced search by name/phone
 * - useCustomer        → fetch one customer with balance
 * - useCustomerHistory → fetch one customer with full transaction history
 * - useCreateCustomer  → create a customer (with optimistic update + invalidation)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/utils/api-client";
import type {
  CustomerView,
  CustomerWithBalance,
  CustomerSearchResult,
  CustomerHistory,
  OutstandingCustomer,
} from "@/lib/services/customers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useState } from "react";

// ────────────────────────────────────────────────────────────────────────────
// Query keys
// ────────────────────────────────────────────────────────────────────────────

export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (withBalances: boolean) =>
    [...customerKeys.lists(), { withBalances }] as const,
  outstanding: () => [...customerKeys.all, "outstanding"] as const,
  search: (query: string) => [...customerKeys.all, "search", query] as const,
  details: () => [...customerKeys.all, "detail"] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
  history: (id: string) =>
    [...customerKeys.details(), id, "history"] as const,
};

// ────────────────────────────────────────────────────────────────────────────
// List + search
// ────────────────────────────────────────────────────────────────────────────

/** List all customers (without balance — fastest path). */
export function useCustomers() {
  return useQuery<CustomerView[]>({
    queryKey: customerKeys.list(false),
    queryFn: () => apiGet<CustomerView[]>("/api/customers"),
  });
}

/** List all customers WITH their current balance (more expensive but richer). */
export function useCustomersWithBalance() {
  return useQuery<CustomerSearchResult[]>({
    queryKey: customerKeys.list(true),
    queryFn: () =>
      apiGet<CustomerSearchResult[]>("/api/customers?withBalances=1"),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * List ONLY customers who currently owe money (balance > 0), sorted by
 * balance descending. Each row also includes lifetime totals and the
 * date of the customer's most recent sale/payment/adjustment.
 *
 * Used by the /khata/outstanding page — the page you land on when you tap
 * the "X customers owe you Rs. Y" hero card on the dashboard.
 *
 * Cache policy: staleTime=0 + refetchOnMount=true so the page always opens
 * with fresh data. This is the page a shopkeeper opens to collect money,
 * so showing a stale balance could cause real-world confusion.
 */
export function useOutstandingCustomers() {
  return useQuery<OutstandingCustomer[]>({
    queryKey: customerKeys.outstanding(),
    queryFn: () => apiGet<OutstandingCustomer[]>("/api/customers?outstanding=1"),
    staleTime: 0,
    refetchOnMount: true,
  });
}

/**
 * Debounced customer search by name/phone.
 *
 * The hook returns:
 *   - query:        the current text in the search box
 *   - setQuery:     setter for the search box
 *   - debouncedQuery: the debounced value used for the actual API call
 *   - results:      the search results (or all customers if query is empty)
 *   - isLoading, isError, error: query state
 */
export function useCustomerSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);

  const result = useQuery<CustomerSearchResult[]>({
    // Empty query → use the same key as list(true) so cache is shared
    queryKey: debouncedQuery.trim() === ""
      ? customerKeys.list(true)
      : customerKeys.search(debouncedQuery),
    queryFn: () => {
      const q = debouncedQuery.trim();
      const url = q ? `/api/customers?q=${encodeURIComponent(q)}` : "/api/customers?withBalances=1";
      return apiGet<CustomerSearchResult[]>(url);
    },
    staleTime: 60 * 1000, // 1 minute — new customers should appear quickly
  });

  return {
    query,
    setQuery,
    debouncedQuery,
    ...result,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Detail + history
// ────────────────────────────────────────────────────────────────────────────

/** Fetch one customer with their balance precomputed. */
export function useCustomer(id: string | null | undefined) {
  return useQuery<CustomerWithBalance>({
    queryKey: id ? customerKeys.detail(id) : ["customers", "detail", "disabled"],
    queryFn: () => apiGet<CustomerWithBalance>(`/api/customers/${id}`),
    enabled: !!id,
  });
}

/**
 * Fetch one customer's complete transaction history with running balance.
 * Used by the customer detail (khata) page.
 */
export function useCustomerHistory(id: string | null | undefined) {
  return useQuery<CustomerHistory>({
    queryKey: id ? customerKeys.history(id) : ["customers", "history", "disabled"],
    queryFn: () => apiGet<CustomerHistory>(`/api/customers/${id}/history`),
    enabled: !!id,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a customer — optimistic: adds to the list immediately, rolls back on error.
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      phone: string;
      address?: string | null;
      notes?: string | null;
      openingBalance?: number;
    }) =>
      apiPost<CustomerView>("/api/customers", input),

    // Optimistic update: add the customer to the list immediately
    onMutate: async (input) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: customerKeys.lists() });

      // Snapshot the previous value for rollback
      const prevList = queryClient.getQueryData<CustomerSearchResult[]>(
        customerKeys.list(true),
      );

      // Create a temporary customer object
      const tempCustomer: CustomerSearchResult = {
        id: `temp-${Date.now()}`,
        name: input.name,
        phone: input.phone,
        balance: String(input.openingBalance ?? 0),
      };

      // Optimistically add to the list
      if (prevList) {
        queryClient.setQueryData<CustomerSearchResult[]>(
          customerKeys.list(true),
          [...prevList, tempCustomer],
        );
      }

      return { prevList };
    },

    onError: (_err, _input, context) => {
      // Roll back to the snapshot
      if (context?.prevList) {
        queryClient.setQueryData(customerKeys.list(true), context.prevList);
      }
    },

    onSuccess: () => {
      // Refetch all customer lists + dashboard
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
