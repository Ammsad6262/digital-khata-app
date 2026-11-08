"use client";

/**
 * AdjustStockForm — record a stock adjustment (recount / write-off / return).
 *
 * Unlike "add stock" (always positive), adjustments are SIGNED:
 *   - Positive (add found stock, customer returned goods)
 *   - Negative (write-off damaged stock, recount downward)
 *
 * The quantity entered here is what gets ADDED to the current stock.
 *   - To remove 5 units, enter "-5" (or use the "Remove stock" button).
 *   - To add 5 units found in back room, enter "+5".
 *
 * Each adjustment creates a StockMove row of type "adjustment". The original
 * stock moves are NOT modified — they stay in history for audit.
 *
 * Fields:
 *   - Product (search)
 *   - Adjustment type: +Add / -Remove
 *   - Quantity (positive number; sign comes from the type)
 *   - Reason (REQUIRED for adjustments — owner must explain why)
 *   - Date (defaults to today)
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Minus, Package, AlertTriangle } from "lucide-react";
import { StockProductPicker } from "@/components/stock/StockProductPicker";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { useAddStockMove } from "@/hooks/use-stock";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity } from "@/lib/utils/money";
import type { ProductSearchResult } from "@/lib/services/products";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

function todayIsoLocal(): string {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

type AdjustType = "add" | "remove";

export function AdjustStockForm({ initialProductId }: { initialProductId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const addStockMove = useAddStockMove();
  const { t } = useLanguage();

  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const [adjustType, setAdjustType] = useState<AdjustType>("remove");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [date, setDate] = useState<string>(todayIsoLocal());

  // Signed quantity based on type
  const signedQuantity = useMemo(() => {
    const qty = parseDecimalSafe(quantity);
    return adjustType === "remove" ? qty.negated() : qty;
  }, [quantity, adjustType]);

  const newStock = useMemo(() => {
    if (!selected) return null;
    return new Decimal(selected.currentStock).plus(signedQuantity);
  }, [selected, signedQuantity]);

  const validation = useMemo(() => {
    const errors: { product?: string; quantity?: string; reason?: string } = {};
    if (!selected) {
      errors.product = t("stock.selectProduct");
    }
    const qty = parseDecimalSafe(quantity);
    if (!quantity || qty.lte(0) || !qty.isFinite()) {
      errors.quantity = t("stock.quantityGtZero");
    }
    if (!reason.trim()) {
      errors.reason = t("stock.reasonRequiredForAdjustments");
    }
    return errors;
  }, [selected, quantity, reason]);

  const hasErrors = !!validation.product || !!validation.quantity || !!validation.reason;

  // Soft warning: if adjustment would make stock negative
  const willGoNegative = newStock !== null && newStock.lt(0);

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
        type: "adjustment",
        quantity: signedQuantity.toString(), // signed
        reason: reason.trim(),
        date: isoDate,
      },
      {
        onSuccess: () => {
          toast.success(t("stock.stockAdjusted"));
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

      {/* Adjustment details */}
      {selected ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-ink-muted">
            2. {t("stock.adjustmentType")}
          </h2>

          <div className="rounded-card border border-line bg-surface shadow-card p-3 space-y-3">
            {/* Type toggle */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                {t("stock.adjustmentType")}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAdjustType("add")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    adjustType === "add"
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-ink-muted hover:bg-app",
                  )}
                >
                  <Plus className="h-4 w-4" />
                  {t("stock.addStockType")}
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType("remove")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    adjustType === "remove"
                      ? "border-danger bg-danger-soft text-danger-ink"
                      : "border-line bg-surface text-ink-muted hover:bg-app",
                  )}
                >
                  <Minus className="h-4 w-4" />
                  {t("stock.removeStockType")}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-ink-subtle">
                {adjustType === "add"
                  ? t("stock.addStockDesc")
                  : t("stock.removeStockDesc")}
              </p>
            </div>

            {/* Quantity */}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                {adjustType === "add" ? t("stock.quantityToAdd") : t("stock.quantityToRemove")}
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

            {/* Reason (REQUIRED) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                {t("stock.reasonRequired")} <span className="text-danger-ink">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  adjustType === "remove"
                    ? t("stock.removeReasonPlaceholder")
                    : t("stock.addReasonPlaceholder")
                }
                rows={2}
                className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  validation.reason
                    ? "border-danger/40 focus:border-danger focus:ring-danger/30"
                    : "border-line-strong focus:border-brand-500 focus:ring-brand-500/30"
                }`}
              />
              {validation.reason ? (
                <p className="mt-1 text-xs text-danger-ink">{validation.reason}</p>
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
          </div>

          {/* Live preview */}
          {quantity && parseDecimalSafe(quantity).gt(0) ? (
            <div className="rounded-lg bg-app px-3 py-2 text-xs text-ink-muted space-y-1">
              <div className="flex items-center justify-between">
                <span>{t("stock.currentStock")}</span>
                <span className="font-medium text-ink">
                  {formatQuantity(selected.currentStock, selected.unit)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{adjustType === "add" ? t("stock.addStockType") : t("stock.removeStockType")}</span>
                <span className={cn(
                  "font-medium",
                  adjustType === "add" ? "text-brand-700" : "text-danger-ink",
                )}>
                  {adjustType === "add" ? "+" : "−"}
                  {formatQuantity(parseDecimalSafe(quantity), selected.unit)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-1">
                <span>{t("stock.newStockWillBe")}</span>
                <span className={cn(
                  "font-bold",
                  willGoNegative ? "text-danger-ink" : "text-ink",
                )}>
                  {newStock ? formatQuantity(newStock, selected.unit) : "—"}
                </span>
              </div>
            </div>
          ) : null}

          {/* Negative stock warning */}
          {willGoNegative ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning-ink">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {t("stock.negativeStockWarning")}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Sticky action bar */}
      <StickyFormActions
        onCancel={() => router.back()}
        onSave={handleSubmit}
        saveLabel={t("stock.saveAdjustment")}
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
