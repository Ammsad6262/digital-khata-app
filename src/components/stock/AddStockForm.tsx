"use client";

/**
 * AddStockForm — record a stock purchase from a supplier.
 *
 * Fields:
 *   - Product (search by name/SKU)
 *   - Quantity (must be > 0)
 *   - Unit cost (optional, for V2 profit reports)
 *   - Reason / note (optional)
 *   - Date (defaults to today)
 *
 * On success: toast + redirect to /more/products/[id] (the product's detail
 * page showing the new movement in its history).
 *
 * Stock increases by `quantity` (the StockMove is type "purchase", positive qty).
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { StockProductPicker } from "@/components/stock/StockProductPicker";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { Money } from "@/components/shared/Money";
import { useAddStockMove } from "@/hooks/use-stock";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity } from "@/lib/utils/money";
import type { ProductSearchResult } from "@/lib/services/products";
import { useLanguage } from "@/providers/language-provider";

function todayIsoLocal(): string {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

export function AddStockForm({ initialProductId }: { initialProductId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const addStockMove = useAddStockMove();
  const { t } = useLanguage();

  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const [quantity, setQuantity] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [date, setDate] = useState<string>(todayIsoLocal());

  // If initialProductId is provided (e.g. /stock/add?productId=X), we could
  // fetch the product. For V1 simplicity, we let the user search/select.

  const totalCost = useMemo(() => {
    const qty = parseDecimalSafe(quantity);
    const cost = parseDecimalSafe(unitCost);
    return qty.times(cost);
  }, [quantity, unitCost]);

  const validation = useMemo(() => {
    const errors: { product?: string; quantity?: string } = {};
    if (!selected) {
      errors.product = t("stock.selectProduct");
    }
    const qty = parseDecimalSafe(quantity);
    if (!quantity || qty.lte(0) || !qty.isFinite()) {
      errors.quantity = t("stock.quantityGtZero");
    }
    return errors;
  }, [selected, quantity]);

  const hasErrors = !!validation.product || !!validation.quantity;

  const handleSubmit = () => {
    if (!selected) {
      toast.error(t("stock.selectProductFirst"));
      return;
    }
    if (hasErrors) {
      toast.error(t("common.fixErrorsBeforeSaving"));
      return;
    }

    const isoDate = new Date(date).toISOString();

    addStockMove.mutate(
      {
        productId: selected.id,
        type: "purchase",
        quantity,
        unitCost: unitCost || null,
        reason: reason.trim() || null,
        date: isoDate,
      },
      {
        onSuccess: (move) => {
          toast.success(t("stock.stockAdded"));
          router.push(`/more/products/${selected.id}`);
        },
        onError: (error) => {
          const message =
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : t("common.failed");
          toast.error(message);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Product selection */}
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-slate-700">
          1. {t("sale.products")}
        </h2>

        {selected ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100">
                <Package className="h-5 w-5 text-brand-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {selected.name}
                </p>
                <p className="text-xs text-slate-500">
                  {selected.category ?? t("stock.uncategorized")} · {selected.unit}
                </p>
                <p className="mt-1 text-xs">
                  <span className="text-slate-500">{t("stock.currentStock")}: </span>
                  <span className="font-semibold text-slate-900">
                    {formatQuantity(selected.currentStock, selected.unit)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
              >
                {t("common.change")}
              </button>
            </div>
          </div>
        ) : (
          <StockProductPicker
            selectedId={null}
            onSelect={(p) => setSelected(p)}
          />
        )}
      </section>

      {/* Quantity + details */}
      {selected ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-slate-700">
            2. {t("stock.addStock")}
          </h2>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            {/* Quantity */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("stock.quantityAdded")}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                autoFocus
                className={`w-full rounded-lg border bg-white px-3 py-2.5 text-lg font-bold tabular-nums text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 ${
                  validation.quantity
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30"
                }`}
              />
              {validation.quantity ? (
                <p className="mt-1 text-xs text-red-600">{validation.quantity}</p>
              ) : null}
            </div>

            {/* Unit cost (optional) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("stock.unitCost")}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                  Rs.
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {t("stock.unitCostHint")}
              </p>
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("payment.date")}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={todayIsoLocal()}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            {/* Reason (optional) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("stock.reason")}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("stock.reasonPlaceholder")}
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          {/* Live totals */}
          {quantity && parseDecimalSafe(quantity).gt(0) ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
              <div className="flex items-center justify-between">
                <span>{t("stock.quantityAdded")}</span>
                <span className="font-semibold text-slate-900">
                  {formatQuantity(parseDecimalSafe(quantity), selected.unit)}
                </span>
              </div>
              {unitCost && parseDecimalSafe(unitCost).gt(0) ? (
                <div className="flex items-center justify-between">
                  <span>{t("expense.total")}</span>
                  <span className="font-semibold text-slate-900">
                    <Money value={totalCost.toString()} />
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                <span>{t("stock.newStockWillBe")}</span>
                <span className="font-bold text-brand-700">
                  {formatQuantity(
                    new Decimal(selected.currentStock).plus(parseDecimalSafe(quantity)),
                    selected.unit,
                  )}
                </span>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Sticky action bar */}
      <StickyFormActions
        onCancel={() => router.back()}
        onSave={handleSubmit}
        saveLabel={t("stock.addStock")}
        saveDisabled={hasErrors || !selected}
        isPending={addStockMove.isPending}
      />
    </div>
  );
}

function parseDecimalSafe(value: string): Decimal {
  if (!value || value.trim() === "") return new Decimal(0);
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
