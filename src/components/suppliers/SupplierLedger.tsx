"use client";

/**
 * SupplierLedger — the purchase and payment history for one supplier.
 *
 * Two tabs, each row can be voided (with an inline confirmation). Voiding a
 * purchase removes the stock it added; voiding a payment puts the money back
 * on the payable. Both are blocked server-side when unsafe.
 */

import { useState } from "react";
import { Ban, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useToast } from "@/providers/toast-provider";
import {
  usePurchasesBySupplier,
  useVoidPurchase,
} from "@/hooks/use-purchases";
import {
  useSupplierPayments,
  useVoidSupplierPayment,
} from "@/hooks/use-supplier-payments";

type Tab = "purchases" | "payments";

const METHOD_KEYS = {
  cash: "method.cash",
  bank: "method.bank",
  cheque: "method.cheque",
  jazzcash: "method.jazzcash",
  easypaisa: "method.easypaisa",
  other: "method.other",
} as const;

export function SupplierLedger({ supplierId }: { supplierId: string }) {
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("purchases");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const purchasesQuery = usePurchasesBySupplier(supplierId);
  const paymentsQuery = useSupplierPayments(supplierId);
  const voidPurchase = useVoidPurchase(supplierId);
  const voidPayment = useVoidSupplierPayment(supplierId);

  async function onVoidPurchase(id: string) {
    try {
      await voidPurchase.mutateAsync(id);
      toast.success(t("purchase.void"));
      setConfirmId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
      setConfirmId(null);
    }
  }

  async function onVoidPayment(id: string) {
    try {
      await voidPayment.mutateAsync(id);
      toast.success(t("supplierPayment.void"));
      setConfirmId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab("purchases")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "purchases" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          {t("supplier.purchasesTab")}
        </button>
        <button
          type="button"
          onClick={() => setTab("payments")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "payments" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          {t("supplier.paymentsTab")}
        </button>
      </div>

      {tab === "purchases" ? (
        purchasesQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-slate-500">{t("common.loading")}</p>
        ) : !purchasesQuery.data || purchasesQuery.data.length === 0 ? (
          <EmptyState
            title={t("purchase.noPurchases")}
            description={t("purchase.noPurchasesHint")}
            icon={<Receipt className="h-6 w-6" />}
          />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {purchasesQuery.data.map((p) => {
              const voided = !!p.voidedAt;
              return (
                <li key={p.id} className={`px-4 py-3 ${voided ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {new Date(p.date).toLocaleDateString()}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {p.items.map((i) => `${i.productName} × ${i.quantity}`).join(", ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        <Money value={p.totalAmount} symbol={symbol} />
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {t("purchase.paidNow")}: <Money value={p.paidAmount} symbol={symbol} />
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      {voided ? (
                        t("common.deleted")
                      ) : (
                        <>
                          {t("supplier.remaining")}:{" "}
                          <span className="font-semibold text-slate-700">
                            <Money value={p.remaining} symbol={symbol} />
                          </span>
                        </>
                      )}
                    </p>
                    {!voided ? (
                      <button
                        type="button"
                        onClick={() => setConfirmId(`purchase:${p.id}`)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        {t("purchase.void")}
                      </button>
                    ) : null}
                  </div>

                  {confirmId === `purchase:${p.id}` ? (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs text-red-800">{t("purchase.voidWarning")}</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => onVoidPurchase(p.id)}
                          disabled={voidPurchase.isPending}
                        >
                          {voidPurchase.isPending ? t("common.deleting") : t("common.yesDelete")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : paymentsQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-slate-500">{t("common.loading")}</p>
      ) : !paymentsQuery.data || paymentsQuery.data.length === 0 ? (
        <EmptyState
          title={t("supplierPayment.noPayments")}
          icon={<Wallet className="h-6 w-6" />}
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {paymentsQuery.data.map((p) => {
            const voided = !!p.voidedAt;
            return (
              <li key={p.id} className={`px-4 py-3 ${voided ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(p.date).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t(METHOD_KEYS[p.method as keyof typeof METHOD_KEYS] ?? "method.other")}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-emerald-700">
                    <Money value={p.amount} symbol={symbol} />
                  </p>
                </div>

                {!voided ? (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setConfirmId(`payment:${p.id}`)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      {t("supplierPayment.void")}
                    </button>
                  </div>
                ) : null}

                {confirmId === `payment:${p.id}` ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-xs text-red-800">{t("supplierPayment.voidWarning")}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onVoidPayment(p.id)}
                        disabled={voidPayment.isPending}
                      >
                        {voidPayment.isPending ? t("common.deleting") : t("common.yesDelete")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
