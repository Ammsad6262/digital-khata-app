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
import { Loader2, Save, Plus, Minus, Package, AlertTriangle } from "lucide-react";
import { StockProductPicker } from "@/components/stock/StockProductPicker";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/shared/Money";
import { useAddStockMove } from "@/hooks/use-stock";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import { Decimal } from "@/lib/utils/decimal";
import { formatQuantity } from "@/lib/utils/money";
import type { ProductSearchResult } from "@/lib/services/products";
import { cn } from "@/lib/utils/cn";

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
      errors.product = "Please select a product.";
    }
    const qty = parseDecimalSafe(quantity);
    if (!quantity || qty.lte(0) || !qty.isFinite()) {
      errors.quantity = "Quantity must be greater than 0.";
    }
    if (!reason.trim()) {
      errors.reason = "Reason is required for adjustments.";
    }
    return errors;
  }, [selected, quantity, reason]);

  const hasErrors = !!validation.product || !!validation.quantity || !!validation.reason;

  // Soft warning: if adjustment would make stock negative
  const willGoNegative = newStock !== null && newStock.lt(0);

  const handleSubmit = () => {
    if (!selected) {
      toast.error("Please select a product first.");
      return;
    }
    if (hasErrors) {
      toast.error("Please fix the errors before saving.");
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
          toast.success(
            `Stock adjusted: ${adjustType === "remove" ? "−" : "+"}${formatQuantity(parseDecimalSafe(quantity), selected.unit)} of ${selected.name}`,
          );
          router.push(`/more/products/${selected.id}`);
        },
        onError: (error) => {
          const message =
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Failed to adjust stock.";
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
          1. Product
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
                  {selected.category ?? "Uncategorized"} · {selected.unit}
                </p>
                <p className="mt-1 text-xs">
                  <span className="text-slate-500">Current stock: </span>
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
                Change
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
          <h2 className="px-1 text-sm font-semibold text-slate-700">
            2. Adjustment
          </h2>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            {/* Type toggle */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Adjustment type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAdjustType("add")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    adjustType === "add"
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Plus className="h-4 w-4" />
                  Add stock
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType("remove")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    adjustType === "remove"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Minus className="h-4 w-4" />
                  Remove stock
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {adjustType === "add"
                  ? "Use this for: found stock, customer returns, recount upward."
                  : "Use this for: damage, write-off, theft, recount downward."}
              </p>
            </div>

            {/* Quantity */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Quantity to {adjustType === "add" ? "add" : "remove"}
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

            {/* Reason (REQUIRED) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Reason <span className="text-red-600">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  adjustType === "remove"
                    ? "e.g. 3 boxes damaged by water"
                    : "e.g. Found 5 units in storage"
                }
                rows={2}
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  validation.reason
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30"
                }`}
              />
              {validation.reason ? (
                <p className="mt-1 text-xs text-red-600">{validation.reason}</p>
              ) : null}
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={todayIsoLocal()}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          {/* Live preview */}
          {quantity && parseDecimalSafe(quantity).gt(0) ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
              <div className="flex items-center justify-between">
                <span>Current stock</span>
                <span className="font-medium text-slate-900">
                  {formatQuantity(selected.currentStock, selected.unit)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{adjustType === "add" ? "Adding" : "Removing"}</span>
                <span className={cn(
                  "font-medium",
                  adjustType === "add" ? "text-brand-700" : "text-red-600",
                )}>
                  {adjustType === "add" ? "+" : "−"}
                  {formatQuantity(parseDecimalSafe(quantity), selected.unit)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                <span>New stock will be</span>
                <span className={cn(
                  "font-bold",
                  willGoNegative ? "text-red-600" : "text-slate-900",
                )}>
                  {newStock ? formatQuantity(newStock, selected.unit) : "—"}
                </span>
              </div>
            </div>
          ) : null}

          {/* Negative stock warning */}
          {willGoNegative ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This adjustment will make the stock go negative (below zero).
                This is allowed but should only happen if you&apos;re sure —
                the stock likely wasn&apos;t recorded properly earlier.
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-[2]"
          disabled={hasErrors || addStockMove.isPending || !selected}
          onClick={handleSubmit}
        >
          {addStockMove.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Adjustment
            </>
          )}
        </Button>
      </div>
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
