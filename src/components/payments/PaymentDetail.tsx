"use client";

/**
 * PaymentDetail — full view of a single payment.
 *
 * Shows:
 *   - Amount hero (green) with method badge + status (Paid / Voided)
 *   - Customer card (tappable → /khata/[id])
 *   - Date + notes
 *   - Void action (with confirmation)
 */

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  AlertCircle,
  Phone,
  Wallet,
  Ban,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { usePayment, useVoidPayment } from "@/hooks/use-payments";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/utils/money";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

type MethodLabelKey = "payment.cash" | "payment.bank" | "payment.cheque" | "payment.jazzcash" | "payment.easypaisa" | "payment.other";
const METHOD_LABELS: Record<string, MethodLabelKey> = {
  cash: "payment.cash",
  bank: "payment.bank",
  cheque: "payment.cheque",
  jazzcash: "payment.jazzcash",
  easypaisa: "payment.easypaisa",
  other: "payment.other",
};

export function PaymentDetail({ paymentId }: { paymentId: string }) {
  const { data: payment, isLoading, isError, error, refetch } = usePayment(paymentId);
  const voidPayment = useVoidPayment();
  const [confirmVoid, setConfirmVoid] = useState(false);
  const { t } = useLanguage();

  if (isLoading) {
    return <PaymentDetailSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        title={t("payment.couldntLoadPayment")}
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

  if (!payment) {
    return (
      <EmptyState
        title={t("payment.paymentNotFound")}
        description={t("payment.paymentNotFoundDesc")}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Link href="/payments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Button>
          </Link>
        }
      />
    );
  }

  const isVoided = !!payment.voidedAt;

  return (
    <div className="space-y-4">
      {/* Amount hero */}
      <div
        className={cn(
          "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
          isVoided && "opacity-75",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  isVoided
                    ? "border-slate-200 bg-slate-100 text-slate-600"
                    : "border-brand-200 bg-brand-50 text-brand-700",
                )}
              >
                {isVoided ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {isVoided ? t("sale.voided") : t("payment.received")}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {METHOD_LABELS[payment.method] ? t(METHOD_LABELS[payment.method] as any) : payment.method}
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-brand-700">
              +<Money value={payment.amount} />
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatDateTime(new Date(payment.date))}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50">
            <Wallet className="h-6 w-6 text-brand-700" />
          </div>
        </div>
      </div>

      {/* Customer card */}
      <Link
        href={`/khata/${payment.customerId}`}
        className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {payment.customerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {payment.customerName}
            </p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Phone className="h-3 w-3" />
              {payment.customerPhone}
            </p>
          </div>
          <span className="text-xs text-brand-600">{t("common.viewKhata")} →</span>
        </div>
      </Link>

      {/* Notes */}
      {payment.notes ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-slate-500">{t("customer.notes")}</p>
          <p className="mt-1 text-sm text-slate-900">{payment.notes}</p>
        </div>
      ) : null}

      {/* Linked sale (if payment was recorded against a specific sale) */}
      {payment.saleId ? (
        <Link
          href={`/sales/${payment.saleId}`}
          className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t("payment.linkedToSale")}</span>
            <span className="font-medium text-brand-600">{t("common.viewSale")} →</span>
          </div>
        </Link>
      ) : null}

      {/* Void section */}
      {isVoided ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-xs text-slate-500">
            {t("payment.voidedOnPrefix")}{payment.voidedAt ? ` ${formatDateTime(new Date(payment.voidedAt))}` : ""}. {t("payment.voidedOnSuffix")}
          </p>
        </div>
      ) : confirmVoid ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-3">
          <div>
            <p className="text-sm font-semibold text-red-900">{t("payment.voidConfirm")}</p>
            <p className="mt-1 text-xs text-red-700">
              {t("payment.voidDesc")} {formatMoney(payment.amount)}
              {t("payment.thisCannotBeUndone")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setConfirmVoid(false)}
              disabled={voidPayment.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={voidPayment.isPending}
              onClick={() => {
                voidPayment.mutate(payment.id, {
                  onSuccess: () => {
                    setConfirmVoid(false);
                    refetch();
                  },
                });
              }}
            >
              {voidPayment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("sale.voiding")}
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  {t("payment.confirmVoid")}
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
          {t("payment.voidPayment")}
        </button>
      )}
    </div>
  );
}

function PaymentDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
      <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}
