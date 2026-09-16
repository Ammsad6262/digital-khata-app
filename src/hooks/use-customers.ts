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
    queryKey: customerKeys.search(debouncedQuery),
    queryFn: () => {
      // Empty query → server returns all customers.
      // Short query → server returns [].
      const q = debouncedQuery.trim();
      const url = q ? `/api/customers?q=${encodeURIComponent(q)}` : "/api/customers?withBalances=1";
      return apiGet<CustomerSearchResult[]>(url);
    },
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
 * Create a customer.
 *
 * On success:
 *   - Invalidates the customer list + search caches so they refetch.
 *   - The caller can then redirect to the new customer's detail page.
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

    onSuccess: () => {
      // Refetch all customer lists/searches.
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      // Dashboard counts also depend on customers.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
