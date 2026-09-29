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
import { AlertCircle, ShoppingCart, Receipt, Plus, Sparkles, ArrowRight } from "lucide-react";
import { useSalesList } from "@/hooks/use-sales";
import type { SaleFilter } from "@/lib/services/sales";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

const FILTERS: Array<{ value: SaleFilter; labelKey: "transactions.today" | "transactions.thisWeek" | "transactions.thisMonth" | "transactions.all" }> = [
  { value: "today", labelKey: "transactions.today" },
  { value: "week", labelKey: "transactions.thisWeek" },
  { value: "month", labelKey: "transactions.thisMonth" },
  { value: "all", labelKey: "transactions.all" },
];

export function SalesList() {
  const [filter, setFilter] = useState<SaleFilter>("today");
  const { data, isLoading, isError, error, refetch } = useSalesList(filter);
  const { t } = useLanguage();

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
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* Summary */}
      {data && data.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {summary.count} {t("transactions.sales")}
            </span>
            <span className="font-medium text-slate-700">
              {t("expense.total")} <Money value={summary.total.toString()} />
            </span>
          </div>
          {summary.outstanding.gt(0) ? (
            <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-xs">
              <span className="text-slate-500">{t("customer.outstandingBalance")}</span>
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
          title={t("common.couldntLoad")}
          description={error instanceof Error ? error.message : t("common.networkError")}
          icon={<AlertCircle className="h-6 w-6" />}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              {t("common.retry")}
            </Button>
          }
        />
      ) : !data || data.length === 0 ? (
        <EmptySalesState filter={filter} />
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
    customerPhone: string | null;
    totalAmount: string;
    paidAmount: string;
    outstanding: string;
    date: string | Date;
  };
  isFirst: boolean;
}) {
  const { t } = useLanguage();
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
            <Money value={outstanding.toString()} /> {t("sale.due")}
          </p>
        ) : (
          <p className="text-[11px] font-medium text-brand-600">{t("sale.paid")}</p>
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

/**
 * Empty sales state — matches the design spec.
 *
 * Layout (vertical, centered):
 *   1. Receipt/document icon with green circle + "+" badge + sparkle accents
 *   2. Heading: "No sales yet" (or "No sales in this period" if a filter is set)
 *   3. Description: "Start recording your first sale to keep track of your
 *      revenue and growth."
 *   4. Large green pill button: "New Sale" with shopping cart icon on the
 *      left and a chevron-right arrow on the right.
 */
function EmptySalesState({ filter }: { filter: SaleFilter }) {
  const { t } = useLanguage();
  const isAllFilter = filter === "all";

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      {/* Receipt icon with green circle + badge + sparkles */}
      <div className="relative mb-5">
        {/* Sparkle accents */}
        <Sparkles className="absolute -left-3 -top-2 h-4 w-4 text-brand-300" aria-hidden />
        <Sparkles className="absolute -right-2 top-2 h-3 w-3 text-brand-200" aria-hidden />

        {/* Main icon container — receipt/document */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Receipt className="h-9 w-9 text-brand-600" strokeWidth={1.75} />
        </div>

        {/* Small "+" badge at bottom-right of the icon */}
        <div className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-sm">
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        </div>
      </div>

      {/* Heading + description */}
      <h3 className="text-base font-semibold text-slate-900">
        {isAllFilter ? t("sale.noSales") : t("sale.noSalesPeriod")}
      </h3>
      <p className="mt-1.5 max-w-xs text-sm text-slate-500">
        {isAllFilter ? t("sale.noSalesDesc") : t("sale.noSalesPeriodDesc")}
      </p>

      {/* Primary CTA — large green pill with shopping cart + chevron */}
      <Link
        href="/sales/new"
        className="mt-6 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-transform hover:scale-[1.02] active:scale-95"
      >
        <ShoppingCart className="h-4 w-4" strokeWidth={2.25} />
        {t("action.newSale")}
        <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
      </Link>
    </div>
  );
}
