"use client";

/**
 * React Query hooks for products.
 *
 * - useProducts       → list (without stock)
 * - useProductsWithStock → list (with stock + low-stock flag)
 * - useProductSearch  → debounced search by name/SKU (with stock)
 * - useProduct         → single product with stock
 * - useCreateProduct   → mutation
 * - useUpdateProduct   → mutation
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/utils/api-client";
import type {
  ProductView,
  ProductWithStock,
  ProductSearchResult,
} from "@/lib/services/products";
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
};

/** List all products (without stock — fastest). */
export function useProducts() {
  return useQuery<ProductView[]>({
    queryKey: productKeys.list(false),
    queryFn: () => apiGet<ProductView[]>("/api/products"),
  });
}

/** List all products WITH current stock. */
export function useProductsWithStock() {
  return useQuery<ProductWithStock[]>({
    queryKey: productKeys.list(true),
    queryFn: () => apiGet<ProductWithStock[]>("/api/products?withStock=1"),
  });
}

/**
 * Debounced product search by name/SKU.
 * Returns products WITH stock so the UI can warn if selling more than available.
 */
export function useProductSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  const result = useQuery<ProductSearchResult[]>({
    queryKey: productKeys.search(debouncedQuery),
    queryFn: () => {
      const q = debouncedQuery.trim();
      const url = q ? `/api/products?q=${encodeURIComponent(q)}` : "/api/products?withStock=1";
      return apiGet<ProductSearchResult[]>(url);
    },
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

      // Create temp product for optimistic display
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
      queryClient.invalidateQueries({ queryKey: productKeys.all });
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
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export { ApiError };

