"use client";

/**
 * React Query hooks for the Transaction History.
 *
 * - useTransactionsList → enriched list (with customer/product names) +
 *   optional summary stats
 *
 * Supports:
 *   - Date filter chips: today / week / month / all
 *   - Custom date range (from / to)
 *   - Type filter (sale / payment / expense / stock_move / balance_adjustment)
 *   - Customer filter (for the per-customer view)
 *
 * The Transaction table is a denormalized MIRROR — the source-of-truth records
 * live in their specialized tables (Sale, Payment, Expense, StockMove,
 * CustomerAdjustment). We never duplicate those records here.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/utils/api-client";
import type {
  TransactionListItem,
  TransactionFilter,
  TransactionType,
} from "@/lib/services/transactions";

export type TransactionSummary = {
  count: number;
  totalIn: string;  // payments received
  totalOut: string; // expenses + sales
} | null;

type TransactionsResponse = {
  transactions: TransactionListItem[];
  summary: TransactionSummary;
};

export const transactionKeys = {
  all: ["transactions"] as const,
  list: (
    filter: TransactionFilter,
    type: TransactionType | undefined,
    from: string | undefined,
    to: string | undefined,
    customerId: string | undefined,
  ) =>
    [
      ...transactionKeys.all,
      "list",
      { filter, type, from, to, customerId },
    ] as const,
};

export function useTransactionsList(options: {
  filter?: TransactionFilter;
  type?: TransactionType;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  customerId?: string;
  includeSummary?: boolean;
  limit?: number;
} = {}) {
  const {
    filter = "all",
    type,
    from,
    to,
    customerId,
    includeSummary = true,
    limit = 100,
  } = options;

  return useQuery<TransactionsResponse>({
    queryKey: transactionKeys.list(filter, type, from, to, customerId),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("filter", filter);
      if (type) params.set("type", type);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (customerId) params.set("customerId", customerId);
      if (!includeSummary) params.set("summary", "0");
      params.set("limit", String(limit));
      return apiGet<TransactionsResponse>(`/api/transactions?${params.toString()}`);
    },
  });
}
