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
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";

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
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();

  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const [quantity, setQuantity] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");
  const [batchName, setBatchName] = useState<string>("");
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
    const errors: { product?: string; quantity?: string; unitCost?: string; costWarning?: string } = {};
    if (!selected) {
      errors.product = t("stock.selectProduct");
    }
    const qty = parseDecimalSafe(quantity);
    if (!quantity || qty.lte(0) || !qty.isFinite()) {
      errors.quantity = t("stock.quantityGtZero");
    }
    // unitCost is required for purchases (each batch must carry its buy price
    // so batch tracking can correctly compute cost-of-goods-sold).
    const cost = parseDecimalSafe(unitCost);
    if (!unitCost || cost.lte(0) || !cost.isFinite()) {
      errors.unitCost = t("stock.unitCostRequired");
    } else if (selected) {
      // Warn (not block) if the unit cost seems unreasonably high —
      // e.g. if selling price is Rs. 800 and user enters Rs. 111,111,
      // that's clearly a typo. This prevents the P&L from showing
      // millions in losses due to data entry errors.
      const selling = parseDecimalSafe(selected.sellingPrice);
      if (selling.gt(0) && cost.gt(selling.times(5))) {
        errors.costWarning = tParams("stock.costWarning", { cost: cost.toFixed(0), selling: selling.toFixed(0) });
      }
    }
    return errors;
  }, [selected, quantity, unitCost]);

  const hasErrors = !!validation.product || !!validation.quantity || !!validation.unitCost;

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
        batchName: batchName.trim() || null,
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
        <h2 className="px-1 text-sm font-semibold text-ink-muted">
          1. {t("sale.products")}
        </h2>

        {selected ? (
          <div className="rounded-card border border-line bg-surface shadow-card p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100">
                <Package className="h-5 w-5 text-brand-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {selected.name}
                </p>
                <p className="text-xs text-ink-subtle">
                  {selected.category ?? t("stock.uncategorized")} · {selected.unit}
                </p>
                <p className="mt-1 text-xs">
                  <span className="text-ink-subtle">{t("stock.currentStock")}: </span>
                  <span className="font-semibold text-ink">
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
          <h2 className="px-1 text-sm font-semibold text-ink-muted">
            2. {t("stock.addStock")}
          </h2>

          <div className="rounded-card border border-line bg-surface shadow-card p-3 space-y-3">
            {/* Batch name (user-defined label for this stock purchase) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                {t("stock.batchNameLabel")} <span className="text-ink-faint">{t("stock.batchNameHintExample")}</span>
              </label>
              <input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder={t("stock.batchNamePlaceholder")}
                maxLength={100}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <p className="mt-1 text-[11px] text-ink-subtle">
                {t("stock.batchNameHint")}
              </p>
            </div>

            {/* Quantity */}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
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
                className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-lg font-bold tabular-nums text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 ${
                  validation.quantity
                    ? "border-danger/40 focus:border-danger focus:ring-danger/30"
                    : "border-line-strong focus:border-brand-500 focus:ring-brand-500/30"
                }`}
              />
              {validation.quantity ? (
                <p className="mt-1 text-xs text-danger-ink">{validation.quantity}</p>
              ) : null}
            </div>

            {/* Unit cost (REQUIRED for purchases — powers batch tracking) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                {t("stock.unitCost")} <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-subtle">
                  {symbol}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0"
                  className={`w-full rounded-lg border bg-surface py-2.5 pl-10 pr-3 text-sm tabular-nums text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 ${
                    validation.unitCost
                      ? "border-danger/40 focus:border-danger focus:ring-danger/30"
                      : "border-line-strong focus:border-brand-500 focus:ring-brand-500/30"
                  }`}
                />
              </div>
              {validation.unitCost ? (
                <p className="mt-1 text-xs text-danger-ink">{validation.unitCost}</p>
              ) : (
                <p className="mt-1 text-[11px] text-ink-subtle">
                  {t("stock.unitCostHintRequired")}
                </p>
              )}
              {validation.costWarning ? (
                <p className="mt-1 rounded-md bg-warning-soft px-2 py-1.5 text-[11px] text-warning-ink">
                  {validation.costWarning}
                </p>
              ) : null}
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                {t("payment.date")}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={todayIsoLocal()}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            {/* Reason (optional) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                {t("stock.reason")}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("stock.reasonPlaceholder")}
                rows={2}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          {/* Live totals */}
          {quantity && parseDecimalSafe(quantity).gt(0) ? (
            <div className="rounded-lg bg-app px-3 py-2 text-xs text-ink-muted space-y-1">
              <div className="flex items-center justify-between">
                <span>{t("stock.quantityAdded")}</span>
                <span className="font-semibold text-ink">
                  {formatQuantity(parseDecimalSafe(quantity), selected.unit)}
                </span>
              </div>
              {unitCost && parseDecimalSafe(unitCost).gt(0) ? (
                <div className="flex items-center justify-between">
                  <span>{t("expense.total")}</span>
                  <span className="font-semibold text-ink">
                    <Money value={totalCost.toString()} />
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-line pt-1">
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
