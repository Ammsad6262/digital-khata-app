"use client";

/**
 * BatchPicker — lets the shopkeeper pick WHICH purchase batch to sell from.
 *
 * Renders as a horizontal scrollable list of "batch chips", each showing:
 *   - Buy price per unit (e.g. "Rs. 50")
 *   - Remaining quantity (e.g. "10 kg left")
 *   - Purchase date (e.g. "Bought 12 Sep")
 *
 * Defaults to the OLDEST batch with remaining > 0 (FIFO).
 *
 * If only one batch is available, auto-selects it (no user interaction needed).
 * If no batches exist for the product, shows a notice that the sale will be
 * recorded as "from opening stock" (untracked).
 *
 * When the user picks a batch, calls `onChange(batchId)`.
 */

import { useEffect, useMemo } from "react";
import { Calendar, Layers, Package } from "lucide-react";
import { useProductBatches } from "@/hooks/use-products";
import { Money } from "@/components/shared/Money";
import { useLanguage } from "@/providers/language-provider";
import { formatDate } from "@/lib/utils/date";
import { Decimal } from "@/lib/utils/decimal";
import { cn } from "@/lib/utils/cn";
import { formatQuantity } from "@/lib/utils/money";

export function BatchPicker({
  productId,
  productUnit,
  selectedBatchId,
  onChange,
  requestedQuantity,
}: {
  productId: string;
  productUnit: string;
  selectedBatchId: string | null;
  onChange: (batchId: string | null) => void;
  /** The quantity the user is currently trying to sell (used to show
   * insufficient-stock warnings per batch). */
  requestedQuantity: string;
}) {
  const { data, isLoading, isError } = useProductBatches(productId);
  const { t } = useLanguage();

  // Filter to batches with remaining > 0 (sorted oldest-first by API)
  const availableBatches = useMemo(() => {
    if (!data) return [];
    return data.filter((b) => new Decimal(b.remainingQuantity).gt(0));
  }, [data]);

  // ── Auto-select the oldest batch on first load (FIFO default) ──────────
  // We do this once when batches first become available, OR if the currently
  // selected batch is no longer in the available list (e.g. sold out).
  useEffect(() => {
    if (availableBatches.length === 0) return;
    const isSelectedStillAvailable =
      selectedBatchId !== null &&
      availableBatches.some((b) => b.id === selectedBatchId);
    if (!isSelectedStillAvailable) {
      const firstBatch = availableBatches[0];
      if (firstBatch) onChange(firstBatch.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableBatches.length, selectedBatchId]);

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400" />
        <span className="ml-1">Loading batches…</span>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
        Couldn't load batches — sale will be untracked.
      </div>
    );
  }

  // ── No batches — sale from opening stock ───────────────────────────────
  if (availableBatches.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
        <p className="text-[11px] font-medium text-amber-800">
          <Package className="mr-1 inline h-3 w-3" />
          {t("sale.noBatches")}
        </p>
        <p className="mt-0.5 text-[10px] text-amber-700">
          {t("sale.noBatchesDesc")}
        </p>
      </div>
    );
  }

  const requested = new Decimal(requestedQuantity || "0");

  // ── Single batch: auto-selected, no need for picker ────────────────────
  if (availableBatches.length === 1) {
    const b = availableBatches[0];
    if (!b) return null;
    return (
      <div className="rounded-md bg-slate-50 px-2 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {t("sale.batchLabel")}
        </p>
        <BatchSummary
          date={b.date}
          unitCost={b.unitCost}
          remaining={b.remainingQuantity}
          unit={productUnit}
          requested={requested}
        />
      </div>
    );
  }

  // ── Multiple batches: picker UI ────────────────────────────────────────
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
      <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        <Layers className="h-3 w-3" />
        {t("sale.batchLabel")} ({availableBatches.length})
      </p>
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {availableBatches.map((b, idx) => {
          const isSelected = b.id === selectedBatchId;
          const remaining = new Decimal(b.remainingQuantity);
          const insufficient = requested.gt(remaining) && requested.gt(0);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange(b.id)}
              className={cn(
                "shrink-0 rounded-md border px-2 py-1 text-left text-[11px] transition-colors",
                isSelected
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500/30"
                  : "border-slate-200 bg-white hover:border-brand-300",
                insufficient && !isSelected && "border-amber-300 bg-amber-50",
              )}
              aria-pressed={isSelected}
            >
              {b.batchName ? (
                <div className="mb-0.5 truncate text-[11px] font-semibold text-slate-900">
                  {b.batchName}
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-brand-100 px-1 text-[9px] font-semibold text-brand-700">
                  #{idx + 1}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  Rs. {b.unitCost ?? "—"}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                <Calendar className="h-2.5 w-2.5" />
                {formatDate(new Date(b.date))}
              </div>
              <div
                className={cn(
                  "mt-0.5 text-[10px] font-medium",
                  insufficient ? "text-amber-700" : "text-slate-600",
                )}
              >
                {formatQuantity(remaining, productUnit)} {t("sale.batchRemaining")}
              </div>
              {insufficient ? (
                <div className="mt-0.5 text-[9px] text-amber-700">
                  ⚠ short by {formatQuantity(requested.minus(remaining), productUnit)}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Compact summary used when there's only ONE batch (no picker needed)
// ────────────────────────────────────────────────────────────────────────────

function BatchSummary({
  date,
  unitCost,
  remaining,
  unit,
  requested,
}: {
  date: Date;
  unitCost: string | null;
  remaining: string;
  unit: string;
  requested: Decimal;
}) {
  const { t } = useLanguage();
  const remainingDec = new Decimal(remaining);
  const insufficient = requested.gt(remainingDec) && requested.gt(0);

  return (
    <div className="mt-0.5 space-y-0.5">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-semibold text-slate-900">
          {t("sale.batchBoughtAt")} Rs. {unitCost ?? t("sale.batchNoCost")}
        </span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500">
          <Calendar className="mr-0.5 inline h-2.5 w-2.5" />
          {formatDate(new Date(date))}
        </span>
      </div>
      <div
        className={cn(
          "text-[10px] font-medium",
          insufficient ? "text-amber-700" : "text-slate-600",
        )}
      >
        {formatQuantity(remainingDec, unit)} {t("sale.batchRemaining")}
        {insufficient ? (
          <span className="ml-1 text-amber-700">
            ⚠ short by {formatQuantity(requested.minus(remainingDec), unit)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
