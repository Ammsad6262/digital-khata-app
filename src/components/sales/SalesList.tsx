"use client";

/**
 * SalesList — client component for the Sales page.
 *
 * Features:
 *   - Date filter chips: Today / Week / Month / All
 *   - Each row shows: customer name, date/time, total, outstanding badge
 *   - Tap → /sales/[id]
 *   - Loading skeleton, empty state, error state with retry
 *   - Summary header: count + total sales value for the selected filter
 */

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, ShoppingCart } from "lucide-react";
import { useSalesList } from "@/hooks/use-sales";
import type { SaleFilter } from "@/lib/services/sales";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const FILTERS: Array<{ value: SaleFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All" },
];

export function SalesList() {
  const [filter, setFilter] = useState<SaleFilter>("today");
  const { data, isLoading, isError, error, refetch } = useSalesList(filter);

  // Compute summary stats for the selected filter.
  const summary = (() => {
    if (!data || data.length === 0) return { count: 0, total: new Decimal(0), outstanding: new Decimal(0) };
    let total = new Decimal(0);
    let outstanding = new Decimal(0);
    for (const s of data) {
      total = total.plus(new Decimal(s.totalAmount));
      outstanding = outstanding.plus(new Decimal(s.outstanding));
    }
    return { count: data.length, total, outstanding };
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
              {summary.count} {summary.count === 1 ? "sale" : "sales"}
            </span>
            <span className="font-medium text-slate-700">
              Total: <Money value={summary.total.toString()} />
            </span>
          </div>
          {summary.outstanding.gt(0) ? (
            <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-xs">
              <span className="text-slate-500">Outstanding</span>
              <span className="font-medium text-red-600">
                <Money value={summary.outstanding.toString()} />
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Body */}
      {isLoading ? (
        <SalesListSkeleton />
      ) : isError ? (
        <EmptyState
          title="Couldn't load sales"
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
          title={`No sales ${filter === "all" ? "yet" : "in this period"}`}
          description={
            filter === "all"
              ? "Record your first sale using the + button above. Sales automatically update customer balances and stock."
              : "Try a different time range, or record a new sale."
          }
          icon={<ShoppingCart className="h-6 w-6" />}
          action={
            <Link href="/sales/new">
              <Button size="sm">
                <ShoppingCart className="h-4 w-4" />
                New Sale
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {data.map((sale, idx) => (
            <SaleRow key={sale.id} sale={sale} isFirst={idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function SaleRow({
  sale,
  isFirst,
}: {
  sale: {
    id: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    totalAmount: string;
    paidAmount: string;
    outstanding: string;
    date: string | Date;
  };
  isFirst: boolean;
}) {
  const outstanding = new Decimal(sale.outstanding);
  const hasOutstanding = outstanding.gt(0);

  return (
    <Link
      href={`/sales/${sale.id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-3 hover:bg-slate-50 active:bg-slate-100",
        !isFirst && "border-t border-slate-100",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
        <ShoppingCart className="h-5 w-5 text-brand-700" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {sale.customerName}
        </p>
        <p className="text-[11px] text-slate-500">
          {formatDate(new Date(sale.date))} · {formatTime(new Date(sale.date))}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-slate-900">
          {formatMoney(sale.totalAmount)}
        </p>
        {hasOutstanding ? (
          <p className="text-[11px] font-medium text-red-600">
            <Money value={outstanding.toString()} /> due
          </p>
        ) : (
          <p className="text-[11px] font-medium text-brand-600">Paid</p>
        )}
      </div>
    </Link>
  );
}

function SalesListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
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
