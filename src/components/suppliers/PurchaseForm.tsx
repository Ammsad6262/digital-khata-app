"use client";

/**
 * PurchaseForm — record stock bought from a supplier.
 *
 * Each row becomes a PurchaseItem + a StockMove (batch), so saving this form
 * increases stock. Money paid now is stored on the purchase (outstanding =
 * total − paid) and is reflected in the supplier's payable immediately.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Money } from "@/components/shared/Money";
import { useToast } from "@/providers/toast-provider";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useProducts } from "@/hooks/use-products";
import { useCreatePurchase } from "@/hooks/use-purchases";

type Row = {
  key: number;
  productId: string;
  quantity: string;
  unitCost: string;
  batchName: string;
};

let rowSeq = 0;
function newRow(): Row {
  rowSeq += 1;
  return { key: rowSeq, productId: "", quantity: "1", unitCost: "", batchName: "" };
}

export function PurchaseForm({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  const { data: products, isLoading: productsLoading } = useProducts();
  const createMutation = useCreatePurchase(supplierId);

  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [paidAmount, setPaidAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const productMap = useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p])),
    [products],
  );

  const total = useMemo(
    () =>
      rows.reduce((sum, r) => {
        const q = Number(r.quantity);
        const c = Number(r.unitCost);
        if (!Number.isFinite(q) || !Number.isFinite(c)) return sum;
        return sum + q * c;
      }, 0),
    [rows],
  );

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onPickProduct(key: number, productId: string) {
    const product = productMap.get(productId);
    updateRow(key, {
      productId,
      unitCost: product ? product.purchasePrice : "",
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const validRows = rows.filter((r) => r.productId);
    if (validRows.length === 0) next.items = t("purchase.addItem");
    for (const r of validRows) {
      if (!(Number(r.quantity) > 0)) next.items = t("purchase.quantity");
      if (Number(r.unitCost) < 0 || !Number.isFinite(Number(r.unitCost))) {
        next.items = t("purchase.unitCost");
      }
    }
    const paid = Number(paidAmount);
    if (!Number.isFinite(paid) || paid < 0) next.paidAmount = t("common.error");
    if (Number.isFinite(paid) && paid > total + 0.001) next.paidAmount = t("common.error");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    try {
      await createMutation.mutateAsync({
        items: rows
          .filter((r) => r.productId)
          .map((r) => ({
            productId: r.productId,
            quantity: Number(r.quantity),
            unitCost: Number(r.unitCost),
            batchName: r.batchName.trim() || null,
          })),
        paidAmount: Number(paidAmount) || 0,
        notes: notes.trim() || null,
        date,
        dueDate: dueDate || null,
      });
      toast.success(t("purchase.recorded"));
      router.push(`/more/suppliers/${supplierId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    }
  }

  if (productsLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-6">
      {errors.items ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.items}</p>
      ) : null}

      <div className="space-y-3">
        {rows.map((row, index) => {
          const product = productMap.get(row.productId);
          const lineTotal =
            (Number(row.quantity) || 0) * (Number(row.unitCost) || 0);

          return (
            <div key={row.key} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("purchase.items")} {index + 1}
                </span>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    className="rounded-lg p-1 text-red-600 hover:bg-red-50"
                    aria-label={t("purchase.removeItem")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={`product-${row.key}`}
                  className="block text-sm font-medium text-slate-700"
                >
                  {t("purchase.product")}
                </label>
                <select
                  id={`product-${row.key}`}
                  value={row.productId}
                  onChange={(e) => onPickProduct(row.key, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <option value="">{t("purchase.pickProduct")}</option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label={`${t("purchase.quantity")}${product ? ` (${product.unit})` : ""}`}
                  name={`qty-${row.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                />
                <TextField
                  label={`${t("purchase.unitCost")} (${symbol})`}
                  name={`cost-${row.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={row.unitCost}
                  onChange={(e) => updateRow(row.key, { unitCost: e.target.value })}
                />
              </div>

              <TextField
                label={t("purchase.batchName")}
                name={`batch-${row.key}`}
                value={row.batchName}
                onChange={(e) => updateRow(row.key, { batchName: e.target.value })}
                hint={t("purchase.batchNameHint")}
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t("purchase.lineTotal")}</span>
                <span className="font-semibold text-slate-900">
                  <Money value={lineTotal} symbol={symbol} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => setRows((prev) => [...prev, newRow()])}
        className="w-full"
      >
        <Plus className="h-4 w-4" />
        {t("purchase.addItem")}
      </Button>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{t("purchase.total")}</span>
          <span className="text-lg font-bold text-slate-900">
            <Money value={total} symbol={symbol} />
          </span>
        </div>
        <TextField
          label={t("purchase.paidNow")}
          name="paidAmount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={paidAmount}
          onChange={(e) => setPaidAmount(e.target.value)}
          error={errors.paidAmount}
          hint={t("purchase.paidNowHint")}
        />
        <TextField
          label={t("purchase.date")}
          name="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TextField
          label={t("purchase.dueDate")}
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          hint={t("purchase.dueDateHint")}
        />
        <div className="space-y-1">
          <label htmlFor="purchase-notes" className="block text-sm font-medium text-slate-700">
            {t("common.notes")}
          </label>
          <textarea
            id="purchase-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={createMutation.isPending} className="flex-1">
          {createMutation.isPending ? t("common.saving") : t("common.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={createMutation.isPending}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
