"use client";

/**
 * SupplierPaymentForm — record money PAID to a supplier.
 *
 * Optionally ties the payment to one invoice; the server rejects paying more
 * than that invoice still owes.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Money } from "@/components/shared/Money";
import { useToast } from "@/providers/toast-provider";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useCreateSupplierPayment } from "@/hooks/use-supplier-payments";
import { usePurchasesBySupplier } from "@/hooks/use-purchases";

const METHODS = ["cash", "bank", "cheque", "jazzcash", "easypaisa", "other"] as const;

const METHOD_KEYS = {
  cash: "method.cash",
  bank: "method.bank",
  cheque: "method.cheque",
  jazzcash: "method.jazzcash",
  easypaisa: "method.easypaisa",
  other: "method.other",
} as const;

export function SupplierPaymentForm({
  supplierId,
  initialPurchaseId,
}: {
  supplierId: string;
  initialPurchaseId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  const createMutation = useCreateSupplierPayment(supplierId);
  const { data: purchases } = usePurchasesBySupplier(supplierId);

  const openInvoices = (purchases ?? []).filter(
    (p) => !p.voidedAt && Number(p.remaining) > 0,
  );

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [purchaseId, setPurchaseId] = useState(initialPurchaseId ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedInvoice = openInvoices.find((p) => p.id === purchaseId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("supplierPayment.amount"));
      return;
    }
    if (selectedInvoice && value > Number(selectedInvoice.remaining) + 0.001) {
      setError(
        t("api.supplierPayment.exceedsOutstanding").replace(
          "{remaining}",
          Number(selectedInvoice.remaining).toFixed(2),
        ),
      );
      return;
    }
    setError(null);

    try {
      await createMutation.mutateAsync({
        amount: value,
        method,
        purchaseId: purchaseId || null,
        notes: notes.trim() || null,
        date,
      });
      toast.success(t("supplierPayment.recorded"));
      router.push(`/more/suppliers/${supplierId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-6">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <TextField
        label={`${t("supplierPayment.amount")} (${symbol})`}
        name="amount"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={!error ? undefined : error}
        required
      />

      <div className="space-y-1">
        <label htmlFor="payment-method" className="block text-sm font-medium text-slate-700">
          {t("supplierPayment.method")}
        </label>
        <select
          id="payment-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {t(METHOD_KEYS[m])}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="payment-invoice" className="block text-sm font-medium text-slate-700">
          {t("supplierPayment.forInvoice")}
        </label>
        <select
          id="payment-invoice"
          value={purchaseId}
          onChange={(e) => setPurchaseId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          <option value="">{t("supplierPayment.general")}</option>
          {openInvoices.map((p) => (
            <option key={p.id} value={p.id}>
              {new Date(p.date).toLocaleDateString()} — {t("supplier.remaining")}:{" "}
              {p.remaining} ({formatPlain(Number(p.remaining), symbol)})
            </option>
          ))}
        </select>
      </div>

      <TextField
        label={t("purchase.date")}
        name="date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <div className="space-y-1">
        <label htmlFor="payment-notes" className="block text-sm font-medium text-slate-700">
          {t("common.notes")}
        </label>
        <textarea
          id="payment-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {selectedInvoice ? (
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">{t("supplier.remaining")}</span>
          <span className="font-semibold text-slate-900">
            <Money value={selectedInvoice.remaining} symbol={symbol} />
          </span>
        </div>
      ) : null}

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

function formatPlain(value: number, symbol: string): string {
  return `${symbol} ${value.toFixed(2)}`;
}
