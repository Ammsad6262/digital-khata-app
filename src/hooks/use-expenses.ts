"use client";

/**
 * React Query hooks for expenses.
 *
 * - useExpensesList  → list with date filter (today/week/month/all)
 * - useRecentExpenses → recent 50 (no filter)
 * - useExpense        → single expense detail
 * - useRecordExpense  → mutation (atomic create)
 * - useUpdateExpense  → mutation (updates expense + Transaction ledger row)
 * - useVoidExpense    → mutation (void — preferred over delete)
 *
 * Data-integrity notes:
 *   - Expenses have NO FK to Customer — cannot affect customer balances.
 *   - Expenses have NO FK to Product — cannot affect stock.
 *   - Dashboard 'today's expenses' uses the SAME source (SUM of non-voided
 *     expenses with date >= start of today in business TZ).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/utils/api-client";
import type {
  ExpenseView,
  ExpenseFilter,
} from "@/lib/services/expenses";

export const expenseKeys = {
  all: ["expenses"] as const,
  lists: () => [...expenseKeys.all, "list"] as const,
  list: (filter: ExpenseFilter) => [...expenseKeys.lists(), { filter }] as const,
  recent: () => [...expenseKeys.all, "recent"] as const,
  details: () => [...expenseKeys.all, "detail"] as const,
  detail: (id: string) => [...expenseKeys.details(), id] as const,
};

// ────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────

/** Expenses list with date filter. */
export function useExpensesList(filter: ExpenseFilter = "all") {
  return useQuery<ExpenseView[]>({
    queryKey: expenseKeys.list(filter),
    queryFn: () =>
      apiGet<ExpenseView[]>(`/api/expenses?filter=${encodeURIComponent(filter)}`),
  });
}

/** Recent expenses (last 50). */
export function useRecentExpenses() {
  return useQuery<ExpenseView[]>({
    queryKey: expenseKeys.recent(),
    queryFn: () => apiGet<ExpenseView[]>("/api/expenses"),
  });
}

/** Single expense detail. */
export function useExpense(id: string | null | undefined) {
  return useQuery<ExpenseView>({
    queryKey: id ? expenseKeys.detail(id) : ["expenses", "detail", "disabled"],
    queryFn: () => apiGet<ExpenseView>(`/api/expenses/${id}`),
    enabled: !!id,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

export type RecordExpenseInput = {
  name: string;
  amount: number | string;
  category: "transport" | "shop" | "electricity" | "packaging" | "salary" | "rent" | "other";
  notes?: string | null;
  date?: string;
};

export type UpdateExpenseInput = Partial<RecordExpenseInput>;

/** Record an expense (atomic — Expense + Transaction ledger row). */
export function useRecordExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordExpenseInput) =>
      apiPost<ExpenseView>("/api/expenses", input),

    onSuccess: () => {
      // All expense lists (all filters — they all need refresh).
      queryClient.invalidateQueries({ queryKey: expenseKeys.lists() });
      // Dashboard (today's expenses / receivables may have changed).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // Transactions feed.
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

/** Update an expense (keeps Transaction ledger row in sync). */
export function useUpdateExpense(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateExpenseInput) =>
      apiPatch<ExpenseView>(`/api/expenses/${id}`, input),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: expenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

/** Void an expense (preferred over hard-delete). */
export function useVoidExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ id: string; voidedAt: string }>(`/api/expenses/${id}?action=void`, {}),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export { ApiError };
