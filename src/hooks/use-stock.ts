"use client";

/**
 * React Query hooks for stock moves.
 *
 * - useStockMoves       → recent stock moves
 * - useStockMovesByProduct → full history for one product
 * - useAddStockMove     → mutation (purchase/adjustment/return)
 *
 * Stock moves are atomic: writes StockMove + Transaction ledger row in one
 * prisma.$transaction. The current stock is DERIVED — see getProductStock()
 * in lib/services/products.ts.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "@/lib/utils/api-client";
import type { StockMoveView } from "@/lib/services/stock";
import { productKeys } from "@/hooks/use-products";

export const stockKeys = {
  all: ["stock"] as const,
  lists: () => [...stockKeys.all, "list"] as const,
  recent: () => [...stockKeys.lists(), "recent"] as const,
  byProduct: (productId: string) =>
    [...stockKeys.all, "byProduct", productId] as const,
};

/** Recent stock moves (last 50). */
export function useStockMoves(limit = 50) {
  return useQuery<StockMoveView[]>({
    queryKey: stockKeys.recent(),
    queryFn: () => apiGet<StockMoveView[]>(`/api/stock/moves`),
  });
}

/** Full stock move history for a specific product (including voided). */
export function useStockMovesByProduct(productId: string | null | undefined) {
  return useQuery<StockMoveView[]>({
    queryKey: productId ? stockKeys.byProduct(productId) : ["stock", "byProduct", "disabled"],
    queryFn: () => apiGet<StockMoveView[]>(`/api/stock/moves?productId=${productId}`),
    enabled: !!productId,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

export type StockMoveType = "purchase" | "adjustment" | "return";

export type AddStockMoveInput = {
  productId: string;
  type: StockMoveType;
  quantity: number | string;
  unitCost?: number | string | null;
  batchName?: string | null;
  reason?: string | null;
  date?: string;
};

/**
 * Add a stock move (purchase, adjustment, or return).
 *
 * On success: invalidates the product's stock + the products list + dashboard
 * (low-stock counts may change) + transactions feed.
 */
export function useAddStockMove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddStockMoveInput) =>
      apiPost<StockMoveView>("/api/stock/moves", input),

    onSuccess: (_data, variables) => {
      // The product's stock changed → invalidate its detail + stock history.
      queryClient.invalidateQueries({
        queryKey: productKeys.detail(variables.productId),
      });
      queryClient.invalidateQueries({
        queryKey: stockKeys.byProduct(variables.productId),
      });
      // Products list (stock changed).
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      // Dashboard (low-stock counts may change).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // Transactions feed.
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export { ApiError };
