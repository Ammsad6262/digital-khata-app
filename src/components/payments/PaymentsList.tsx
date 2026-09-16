"use client";

/**
 * PaymentsList — client component for the Payments page.
 *
 * Features:
 *   - Date filter chips: Today / Week / Month / All
 *   - Each row shows: customer name, date/time, amount, method badge
 *   - Tap → /payments/[id]
 *   - Summary header: count + total received for the selected filter
 *   - Loading skeleton, empty state, error state with retry
 */

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Wallet } from "lucide-react";
import { usePaymentsList } from "@/hooks/use-payments";
import type { PaymentFilter } from "@/lib/services/payments";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const FILTERS: Array<{ value: PaymentFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All" },
];

const METHOD_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  cash:      { label: "Cash",      bg: "bg-brand-50",  text: "text-brand-700" },
  bank:      { label: "Bank",      bg: "bg-blue-50",   text: "text-blue-700" },
  cheque:    { label: "Cheque",    bg: "bg-purple-50", text: "text-purple-700" },
  jazzcash:  { label: "JazzCash",  bg: "bg-orange-50", text: "text-orange-700" },
  easypaisa: { label: "EasyPaisa", bg: "bg-green-50",  text: "text-green-700" },
  other:     { label: "Other",     bg: "bg-slate-100", text: "text-slate-700" },
};

export function PaymentsList() {
  const [filter, setFilter] = useState<PaymentFilter>("today");
  const { data, isLoading, isError, error, refetch } = usePaymentsList(filter);

  // Compute summary stats for the selected filter.
  const summary = (() => {
    if (!data || data.length === 0) return { count: 0, total: new Decimal(0) };
    let total = new Decimal(0);
    for (const p of data) {
      total = total.plus(new Decimal(p.amount));
    }
    return { count: data.length, total };
  })();

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {data && data.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {summary.count} {summary.count === 1 ? "payment" : "payments"}
            </span>
            <span className="font-medium text-slate-700">
              Total received: <Money value={summary.total.toString()} />
            </span>
          </div>
        </div>
      ) : null}

      {/* Body */}
      {isLoading ? (
        <PaymentsListSkeleton />
      ) : isError ? (
        <EmptyState
          title="Couldn't load payments"
          description={error instanceof Error ? error.message : "Something went wrong."}
          icon={<AlertCircle className="h-6 w-6" />}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Retry
            </Button>
          }
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title={`No payments ${filter === "all" ? "yet" : "in this period"}`}
          description={
            filter === "all"
              ? "Record your first payment using the + button above. Payments automatically reduce customer balances."
              : "Try a different time range, or record a new payment."
          }
          icon={<Wallet className="h-6 w-6" />}
          action={
            <Link href="/payments/new">
              <Button size="sm">
                <Wallet className="h-4 w-4" />
                Add Payment
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {data.map((payment, idx) => (
            <PaymentRow key={payment.id} payment={payment} isFirst={idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentRow({
  payment,
  isFirst,
}: {
  payment: {
    id: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    amount: string;
    method: string;
    notes: string | null;
    date: string | Date;
  };
  isFirst: boolean;
}) {
  const methodBadge = METHOD_BADGES[payment.method] ?? METHOD_BADGES.other ?? {
    label: "Other",
    bg: "bg-slate-100",
    text: "text-slate-700",
  };

  return (
    <Link
      href={`/payments/${payment.id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-3 hover:bg-slate-50 active:bg-slate-100",
        !isFirst && "border-t border-slate-100",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
        <Wallet className="h-5 w-5 text-brand-700" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {payment.customerName}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[10px] font-medium",
              methodBadge.bg,
              methodBadge.text,
            )}
          >
            {methodBadge.label}
          </span>
          <span>·</span>
          <span>
            {formatDate(new Date(payment.date))} · {formatTime(new Date(payment.date))}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-brand-700">
          +{formatMoney(payment.amount)}
        </p>
      </div>
    </Link>
  );
}

function PaymentsListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 px-3 py-3",
              i > 0 && "border-t border-slate-100",
            )}
          >
            <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
