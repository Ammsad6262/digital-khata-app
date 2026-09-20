"use client";

/**
 * ProductPicker — search-driven product selector for the New Sale form.
 *
 * Shows the search results as a list. Tapping a product adds it as a line
 * item (the parent owns the line-items array; we just call onAdd).
 *
 * When search returns no matches: shows an INLINE QUICK-ADD form so the
 * user can create a product on the fly without leaving the sale. This
 * avoids losing line items.
 *
 * Each result shows:
 *   - Product name + SKU
 *   - Current stock (with low-stock badge if applicable)
 *   - Default selling price (will be pre-filled in the line item)
 *
 * If the product is already in the cart (line items), we show "Added" and
 * disable the button to prevent duplicates.
 */

import { Search, Plus, Package, Check, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useProductSearch, useCreateProduct } from "@/hooks/use-products";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity, formatMoney } from "@/lib/utils/money";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import type { ProductSearchResult } from "@/lib/services/products";
import { useLanguage } from "@/providers/language-provider";

const UNITS = ["piece", "kg", "box", "dozen", "litre", "pack", "bag", "bottle", "carton"];

export function ProductPicker({
  alreadyAddedProductIds,
  onAdd,
}: {
  alreadyAddedProductIds: Set<string>;
  onAdd: (product: ProductSearchResult) => void;
}) {
  const { query, setQuery, data, isLoading, isError } = useProductSearch();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { t } = useLanguage();

  // Inline quick-add form
  if (showQuickAdd) {
    return (
      <QuickAddProduct
        initialName={query.trim()}
        onCancel={() => setShowQuickAdd(false)}
        onCreated={(product) => {
          setShowQuickAdd(false);
          setQuery("");
          onAdd(product);
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("sale.searchProduct")}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          aria-label={t("common.searchProductAria")}
          autoFocus
        />
      </div>

      <div className="space-y-1">
        {isLoading ? (
          <p className="px-2 py-3 text-xs text-slate-400">{t("common.loading")}</p>
        ) : isError ? (
          <p className="px-2 py-3 text-xs text-red-600">{t("common.couldntLoad")}</p>
        ) : !data || data.length === 0 ? (
          query.trim() ? (
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 px-3 py-3 text-left hover:bg-blue-50 active:bg-blue-100"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Plus className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-blue-700">
                  {t("stock.addProduct")} &ldquo;{query.trim()}&rdquo;
                </p>
                <p className="text-[11px] text-slate-500">
                  {t("common.tapToCreate")}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-blue-400" />
            </button>
          ) : (
            <p className="px-2 py-3 text-xs text-slate-400">
              {t("sale.startTypingProduct")}
            </p>
          )
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {data.slice(0, 6).map((product, idx) => {
              const alreadyAdded = alreadyAddedProductIds.has(product.id);
              const stock = new Decimal(product.currentStock);
              const isLowStock = stock.lte(product.lowStockThreshold);
              const isNegative = stock.lt(0);

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => !alreadyAdded && onAdd(product)}
                  disabled={alreadyAdded}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                    idx > 0 ? "border-t border-slate-100" : ""
                  } ${alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Package className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {product.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          isNegative
                            ? "text-red-600 font-medium"
                            : isLowStock
                              ? "text-amber-600 font-medium"
                              : "text-slate-500"
                        }
                      >
                        {isNegative ? (
                          <span className="inline-flex items-center gap-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            {formatQuantity(stock, product.unit)} ({t("stock.belowZero")})
                          </span>
                        ) : (
                          <span>{formatQuantity(stock, product.unit)} {t("stock.inStock")}</span>
                        )}
                      </span>
                      {product.sku ? (
                        <span className="text-slate-400">· {product.sku}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-slate-700">
                      {formatMoney(product.sellingPrice)}
                    </p>
                    <p className="text-[10px] text-slate-400">{t("product.per")} {product.unit}</p>
                  </div>
                  <div className="shrink-0">
                    {alreadyAdded ? (
                      <Check className="h-4 w-4 text-brand-600" />
                    ) : (
                      <Plus className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Inline Quick Add Product — mini form that creates a product on the fly
// without navigating away (preserves the sale's line items)
// ────────────────────────────────────────────────────────────────────────────

function QuickAddProduct({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string;
  onCancel: () => void;
  onCreated: (product: ProductSearchResult) => void;
}) {
  const toast = useToast();
  const createProduct = useCreateProduct();
  const { t } = useLanguage();
  const [name, setName] = useState(initialName);
  const [sellingPrice, setSellingPrice] = useState("");
  const [unit, setUnit] = useState("piece");

  const sp = parseFloat(sellingPrice);
  const canSave = name.trim().length > 0 && !isNaN(sp) && sp > 0 && !createProduct.isPending;

  const handleCreate = () => {
    if (!canSave) return;
    createProduct.mutate(
      {
        name: name.trim(),
        purchasePrice: sp,
        sellingPrice: sp,
        unit,
        openingStock: 0,
        lowStockThreshold: 5,
      },
      {
        onSuccess: (product) => {
          toast.success(t("product.productAdded"));
          onCreated({
            id: product.id,
            name: product.name,
            category: product.category,
            purchasePrice: product.purchasePrice,
            sellingPrice: product.sellingPrice,
            unit: product.unit,
            sku: product.sku,
            openingStock: product.openingStock,
            lowStockThreshold: product.lowStockThreshold,
            currentStock: "0",
            isLowStock: true,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
          });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === "CONFLICT") {
            toast.error(t("product.skuExists"));
          } else {
            toast.error(error instanceof Error ? error.message : t("common.failed"));
          }
        },
      },
    );
  };

  return (
    <div className="rounded-xl border-2 border-blue-300 bg-white p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
        <Plus className="h-4 w-4" />
        {t("stock.addProduct")}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("product.productName")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("product.sellingPrice")}</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">Rs.</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("product.unit")}</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canSave}
          className="flex-[2] flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
        >
          {createProduct.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              {t("common.save")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
