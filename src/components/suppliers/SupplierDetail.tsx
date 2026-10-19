"use client";

/**
 * SupplierDetail — one supplier with what the business owes them.
 *
 * Only actions that actually work today are shown (Edit, Delete).
 * Purchase / payment actions will be added with those modules.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Trash2, Truck, Wallet } from "lucide-react";
import { useSupplier, useDeleteSupplier } from "@/hooks/use-suppliers";
import { SupplierLedger } from "@/components/suppliers/SupplierLedger";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useToast } from "@/providers/toast-provider";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";

export function SupplierDetail({ supplierId }: { supplierId: string }) {
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  const toast = useToast();
  const router = useRouter();
  const { data, isLoading, isError, error } = useSupplier(supplierId);
  const deleteMutation = useDeleteSupplier();
  const [confirming, setConfirming] = useState(false);

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-8 text-center text-sm text-red-600">
        {error instanceof Error ? error.message : t("common.couldntLoad")}
      </p>
    );
  }

  const balance = Number(data.balance);
  const statusLabel =
    balance > 0 ? t("supplier.payable") : balance < 0 ? t("supplier.advancePaid") : t("supplier.settled");

  async function onDelete() {
    try {
      await deleteMutation.mutateAsync(supplierId);
      toast.success(t("common.deleted"));
      router.push("/more/suppliers");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Truck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{data.name}</h2>
            {data.phone ? <p className="text-sm text-slate-500">{data.phone}</p> : null}
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{statusLabel}</p>
          <p
            className={
              balance > 0
                ? "mt-1 text-2xl font-bold text-amber-700"
                : balance < 0
                  ? "mt-1 text-2xl font-bold text-emerald-700"
                  : "mt-1 text-2xl font-bold text-slate-700"
            }
          >
            <Money value={Math.abs(balance)} symbol={symbol} />
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-slate-100 p-3">
            <dt className="text-xs text-slate-500">{t("supplier.totalPurchases")}</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">
              <Money value={data.totalPurchases} symbol={symbol} />
            </dd>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <dt className="text-xs text-slate-500">{t("supplier.totalPayments")}</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">
              <Money value={data.totalPayments} symbol={symbol} />
            </dd>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <dt className="text-xs text-slate-500">{t("supplier.totalOutstanding")}</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">
              <Money value={data.totalOutstanding} symbol={symbol} />
            </dd>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <dt className="text-xs text-slate-500">{t("supplier.openingBalance")}</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">
              <Money value={data.openingBalance} symbol={symbol} />
            </dd>
          </div>
        </dl>
      </div>

      {data.email || data.address || data.notes ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          {data.email ? (
            <p><span className="text-slate-500">{t("supplier.email")}: </span>{data.email}</p>
          ) : null}
          {data.address ? (
            <p><span className="text-slate-500">{t("supplier.address")}: </span>{data.address}</p>
          ) : null}
          {data.notes ? (
            <p><span className="text-slate-500">{t("common.notes")}: </span>{data.notes}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Link href={`/more/suppliers/${supplierId}/purchase/new`}>
          <Button className="w-full">
            <Plus className="h-4 w-4" />
            {t("purchase.addPurchase")}
          </Button>
        </Link>
        <Link href={`/more/suppliers/${supplierId}/payment/new`}>
          <Button variant="secondary" className="w-full">
            <Wallet className="h-4 w-4" />
            {t("supplierPayment.recordPayment")}
          </Button>
        </Link>
      </div>

      <SupplierLedger supplierId={supplierId} />

      <div className="flex gap-3">
        <Link href={`/more/suppliers/${supplierId}/edit`} className="flex-1">
          <Button variant="outline" className="w-full">
            <Pencil className="h-4 w-4" />
            {t("common.edit")}
          </Button>
        </Link>
        <Button
          variant="danger"
          onClick={() => setConfirming(true)}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4" />
          {t("common.delete")}
        </Button>
      </div>

      {confirming ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{t("supplier.deleteWarning")}</p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("common.deleting") : t("common.yesDelete")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
