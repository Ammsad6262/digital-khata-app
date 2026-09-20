"use client";

/**
 * SaleDetail — full view of a single sale.
 *
 * Shows:
 *   - Status badge (paid / partial / voided)
 *   - Customer card (link to khata)
 *   - Date + notes
 *   - Items list (product, qty, price, line total)
 *   - Payment summary (total, paid, outstanding)
 *   - Void action (with confirmation)
 */

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  AlertCircle,
  Phone,
  ShoppingCart,
  CheckCircle2,
  Clock,
  Ban,
  Loader2,
} from "lucide-react";
import { useSale, useVoidSale } from "@/hooks/use-sales";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatMoney, formatQuantity } from "@/lib/utils/money";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export function SaleDetail({ saleId }: { saleId: string }) {
  const { data: sale, isLoading, isError, error, refetch } = useSale(saleId);
  const voidSale = useVoidSale();
  const [confirmVoid, setConfirmVoid] = useState(false);
  const { t } = useLanguage();

  if (isLoading) {
    return <SaleDetailSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        title={t("sale.couldntLoadSale")}
        description={error instanceof Error ? error.message : t("common.networkError")}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm">
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  if (!sale) {
    return (
      <EmptyState
        title={t("sale.saleNotFound")}
        description={t("sale.saleNotFoundDesc")}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Link href="/sales">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Button>
          </Link>
        }
      />
    );
  }

  const total = new Decimal(sale.totalAmount);
  const paid = new Decimal(sale.paidAmount);
  const outstanding = new Decimal(sale.outstanding);
  const isFullyPaid = outstanding.lte(0);
  const isVoided = !!sale.voidedAt;

  const statusBadge = isVoided
    ? { label: t("sale.voided"), color: "bg-slate-100 text-slate-600 border-slate-200" }
    : isFullyPaid
      ? { label: t("sale.paid"), color: "bg-brand-50 text-brand-700 border-brand-200" }
      : { label: t("sale.partial"), color: "bg-amber-50 text-amber-700 border-amber-200" };

  return (
    <div className="space-y-4">
      {/* Status hero */}
      <div
        className={cn(
          "rounded-2xl border bg-white p-4 shadow-sm",
          isVoided ? "border-slate-200 opacity-75" : "border-slate-200",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                statusBadge.color,
              )}
            >
              {isVoided ? <Ban className="h-3 w-3" /> : isFullyPaid ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {statusBadge.label}
            </span>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              <Money value={sale.totalAmount} />
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatDateTime(new Date(sale.date))}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50">
            <ShoppingCart className="h-6 w-6 text-brand-700" />
          </div>
        </div>

        {/* Payment summary tiles */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{t("sale.total")}</p>
            <p className="text-sm font-bold tabular-nums text-slate-900">
              <Money value={sale.totalAmount} />
            </p>
          </div>
          <div className="rounded-lg bg-brand-50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-brand-700">{t("sale.paid")}</p>
            <p className="text-sm font-bold tabular-nums text-brand-700">
              <Money value={sale.paidAmount} />
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg p-2 text-center",
              outstanding.gt(0) ? "bg-red-50" : "bg-slate-50",
            )}
          >
            <p
              className={cn(
                "text-[10px] uppercase tracking-wide",
                outstanding.gt(0) ? "text-red-700" : "text-slate-500",
              )}
            >
              {t("sale.due")}
            </p>
            <p
              className={cn(
                "text-sm font-bold tabular-nums",
                outstanding.gt(0) ? "text-red-700" : "text-slate-900",
              )}
            >
              <Money value={sale.outstanding} />
            </p>
          </div>
        </div>
      </div>

      {/* Customer card */}
      <Link
        href={`/khata/${sale.customerId}`}
        className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {sale.customerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {sale.customerName}
            </p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Phone className="h-3 w-3" />
              {sale.customerPhone}
            </p>
          </div>
          <span className="text-xs text-brand-600">{t("common.viewKhata")} →</span>
        </div>
      </Link>

      {/* Notes */}
      {sale.notes ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-slate-500">{t("customer.notes")}</p>
          <p className="mt-1 text-sm text-slate-900">{sale.notes}</p>
        </div>
      ) : null}

      {/* Items list */}
      <section className="space-y-2">
        <h3 className="px-1 text-sm font-semibold text-slate-700">
          {t("sale.items")} ({sale.items.length})
        </h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sale.items.map((item, idx) => {
            const lineTotal = new Decimal(item.total);
            return (
              <div
                key={item.id}
                className={cn(
                  "px-3 py-2.5",
                  idx > 0 && "border-t border-slate-100",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {item.productName}
                  </p>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                    <Money value={lineTotal.toString()} />
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatQuantity(item.quantity, item.productUnit)} × {formatMoney(item.unitPrice)} / {item.productUnit}
                </p>
              </div>
            );
          })}
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-700">{t("sale.total")}</span>
              <span className="text-sm font-bold tabular-nums text-slate-900">
                <Money value={sale.totalAmount} />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Void action */}
      {isVoided ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-xs text-slate-500">
            {t("sale.voidedOn")} {sale.voidedAt ? formatDateTime(new Date(sale.voidedAt)) : "—"}. {t("sale.voidedDesc")}
          </p>
        </div>
      ) : confirmVoid ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-3">
          <div>
            <p className="text-sm font-semibold text-red-900">{t("sale.voidSaleConfirm")}</p>
            <p className="mt-1 text-xs text-red-700">
              {paid.gt(0) ? (
                <>
                  {t("sale.hadPaymentsPrefix")} {formatMoney(paid)}{" "}
                  {t("sale.hadPaymentsMiddle")}{" "}
                  {formatMoney(paid.minus(total).abs())}{" "}
                  {t("sale.hadPaymentsSuffix")}
                </>
              ) : (
                <>{t("sale.voidDescNoPayments")}</>
              )}{" "}
              {t("sale.voidDescStockRestored")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setConfirmVoid(false)}
              disabled={voidSale.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={voidSale.isPending}
              onClick={() => {
                voidSale.mutate(sale.id, {
                  onSuccess: () => {
                    setConfirmVoid(false);
                    refetch();
                  },
                });
              }}
            >
              {voidSale.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("sale.voiding")}
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  {t("sale.voidConfirm")}
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmVoid(true)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          {t("sale.voidSale")}
        </button>
      )}
    </div>
  );
}

function SaleDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-44 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn("px-3 py-2.5", i > 0 && "border-t border-slate-100")}
            >
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="mt-1 h-2.5 w-24 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
