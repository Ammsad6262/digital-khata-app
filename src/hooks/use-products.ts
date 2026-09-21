"use client";

/**
 * React Query hooks for products.
 *
 * - useProducts       → list (without stock)
 * - useProductsWithStock → list (with stock + low-stock flag)
 * - useProductSearch  → debounced search by name/SKU (with stock)
 * - useProduct         → single product with stock
 * - useProductBatches → list of purchase batches for ONE product (with remaining qty)
 * - useCreateProduct   → mutation
 * - useUpdateProduct   → mutation
 *
 * IMPORTANT: useProductSearch with empty query shares the SAME cache key
 * as useProductsWithStock — so navigating between Stock page and Products
 * page doesn't cause a separate API call.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/utils/api-client";
import type {
  ProductView,
  ProductWithStock,
  ProductSearchResult,
} from "@/lib/services/products";
import type { ProductBatch } from "@/lib/services/stock";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useState } from "react";

export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (withStock: boolean) =>
    [...productKeys.lists(), { withStock }] as const,
  search: (query: string) => [...productKeys.all, "search", query] as const,
  details: () => [...productKeys.all, "detail"] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  batches: (productId: string) =>
    [...productKeys.detail(productId), "batches"] as const,
};

/** List all products (without stock — fastest). */
export function useProducts() {
  return useQuery<ProductView[]>({
    queryKey: productKeys.list(false),
    queryFn: () => apiGet<ProductView[]>("/api/products"),
    // Short staleTime for product lists — new products should appear quickly
    staleTime: 60 * 1000, // 1 minute
  });
}

/** List all products WITH current stock. */
export function useProductsWithStock() {
  return useQuery<ProductWithStock[]>({
    queryKey: productKeys.list(true),
    queryFn: () => apiGet<ProductWithStock[]>("/api/products?withStock=1"),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Debounced product search by name/SKU.
 *
 * When query is empty, uses the SAME cache key as useProductsWithStock
 * so the data is shared between Stock page and Products page.
 */
export function useProductSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  const result = useQuery<ProductSearchResult[]>({
    // Empty query → use the same key as useProductsWithStock
    queryKey: debouncedQuery.trim() === ""
      ? productKeys.list(true)  // shares cache with useProductsWithStock
      : productKeys.search(debouncedQuery),
    queryFn: () => {
      const q = debouncedQuery.trim();
      const url = q ? `/api/products?q=${encodeURIComponent(q)}` : "/api/products?withStock=1";
      return apiGet<ProductSearchResult[]>(url);
    },
    staleTime: 60 * 1000, // 1 minute
  });

  return {
    query,
    setQuery,
    debouncedQuery,
    ...result,
  };
}

/** Single product with stock. */
export function useProduct(id: string | null | undefined) {
  return useQuery<ProductWithStock>({
    queryKey: id ? productKeys.detail(id) : ["products", "detail", "disabled"],
    queryFn: () => apiGet<ProductWithStock>(`/api/products/${id}`),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch all available purchase batches for ONE product, sorted oldest first.
 *
 * Used by the New Sale form's batch picker — when the shopkeeper picks a
 * product, this fetches all purchase batches with remaining stock so they
 * can choose which batch to sell from (FIFO default, but user can override).
 *
 * Cache policy: staleTime=0 + refetchOnMount=true. Batch remaining quantities
 * change on every sale, so we always want fresh data when the picker opens.
 * (If the same product is added twice in the same sale, the second picker
 * benefits from the cached first fetch via React Query's dedup.)
 */
export function useProductBatches(productId: string | null | undefined) {
  return useQuery<ProductBatch[]>({
    queryKey: productId
      ? productKeys.batches(productId)
      : ["products", "batches", "disabled"],
    queryFn: () => apiGet<ProductBatch[]>(`/api/products/${productId}/batches`),
    enabled: !!productId,
    staleTime: 0,
    refetchOnMount: true,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      category?: string | null;
      purchasePrice: number;
      sellingPrice: number;
      unit?: string;
      sku?: string | null;
      openingStock?: number;
      lowStockThreshold?: number;
    }) => apiPost<ProductView>("/api/products", input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: productKeys.lists() });

      const prevList = queryClient.getQueryData<ProductWithStock[]>(productKeys.list(true));

      const tempProduct: ProductWithStock = {
        id: `temp-${Date.now()}`,
        name: input.name,
        category: input.category ?? null,
        purchasePrice: String(input.purchasePrice),
        sellingPrice: String(input.sellingPrice),
        unit: input.unit ?? "piece",
        sku: input.sku ?? null,
        openingStock: String(input.openingStock ?? 0),
        lowStockThreshold: input.lowStockThreshold ?? 5,
        currentStock: String(input.openingStock ?? 0),
        isLowStock: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (prevList) {
        queryClient.setQueryData<ProductWithStock[]>(productKeys.list(true), [...prevList, tempProduct]);
      }

      return { prevList };
    },

    onError: (_err, _input, context) => {
      if (context?.prevList) {
        queryClient.setQueryData(productKeys.list(true), context.prevList);
      }
    },

    onSuccess: () => {
      // Force refetch — set staleTime to 0 for this key
      queryClient.invalidateQueries({ queryKey: productKeys.all, refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<{
      name: string;
      category: string | null;
      purchasePrice: number;
      sellingPrice: number;
      unit: string;
      sku: string | null;
      lowStockThreshold: number;
    }>) => apiPatch<ProductView>(`/api/products/${id}`, input),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id), refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: productKeys.lists(), refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export { ApiError };
