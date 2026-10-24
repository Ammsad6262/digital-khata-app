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
import { useMemo, useState } from "react";
import { AlertCircle, ShoppingCart, Receipt, Plus, Sparkles, ArrowRight, Calendar, CalendarDays, CalendarRange, LayoutGrid, Search, X } from "lucide-react";
import { useSalesList } from "@/hooks/use-sales";
import type { SaleFilter } from "@/lib/services/sales";
import { EmptyState } from "@/components/shared/EmptyState";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const FILTERS: Array<{
  value: SaleFilter;
  labelKey: "transactions.today" | "transactions.thisWeek" | "transactions.thisMonth" | "transactions.all";
  icon: typeof Calendar;
}> = [
  { value: "today", labelKey: "transactions.today", icon: Calendar },
  { value: "week", labelKey: "transactions.thisWeek", icon: CalendarRange },
  { value: "month", labelKey: "transactions.thisMonth", icon: CalendarDays },
  { value: "all", labelKey: "transactions.all", icon: LayoutGrid },
];

type SaleStatusFilter = "all" | "unpaid" | "partial" | "paid" | "overdue";

const STATUS_FILTERS: Array<{
  value: SaleStatusFilter;
  labelKey: TranslationKey;
}> = [
  { value: "all", labelKey: "sale.filterAll" },
  { value: "unpaid", labelKey: "sale.filterUnpaid" },
  { value: "partial", labelKey: "sale.filterPartial" },
  { value: "paid", labelKey: "sale.filterPaid" },
  { value: "overdue", labelKey: "sale.filterOverdue" },
];

export function SalesList() {
  const [filter, setFilter] = useState<SaleFilter>("today");
  const [status, setStatus] = useState<SaleStatusFilter>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useSalesList(filter);
  const { t } = useLanguage();

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.filter((sale) => {
      const paid = new Decimal(sale.paidAmount);
      const outstanding = new Decimal(sale.outstanding);
      if (status === "unpaid" && !paid.eq(0)) return false;
      if (status === "partial" && !(outstanding.gt(0) && paid.gt(0))) return false;
      if (status === "paid" && !outstanding.eq(0)) return false;
      if (status === "overdue" && !sale.isOverdue) return false;
      if (query) {
        const haystack = `${sale.customerName} ${sale.customerPhone ?? ""} ${sale.id} ${sale.totalAmount}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [data, search, status]);

  // Compute summary stats for the selected date + status/search filters.
  const summary = (() => {
    if (filtered.length === 0) {
      return { count: 0, total: new Decimal(0), outstanding: new Decimal(0) };
    }
    let total = new Decimal(0);
    let outstanding = new Decimal(0);
    for (const s of filtered) {
      total = total.plus(new Decimal(s.totalAmount));
      outstanding = outstanding.plus(new Decimal(s.outstanding));
    }
    return { count: filtered.length, total, outstanding };
  })();

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }} className="-mx-4 px-4 sm:-mx-6 sm:px-6">
      <div className="space-y-3">
        {/* Filter chips — each has an icon + label, active chip is green */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(f.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Search by customer, phone, or sale ID */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("sale.searchListPlaceholder")}
            aria-label={t("sale.searchListPlaceholder")}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("common.clearSearchAria")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Payment-status chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((item) => {
            const active = status === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatus(item.value)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>

      {/* Summary */}
      {filtered.length > 0 ? (
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
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t("sale.noMatches")}
          description={t("sale.noMatchesDesc")}
          icon={<Search className="h-6 w-6" />}
          action={
            <Button
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
              variant="outline"
              size="sm"
            >
              {t("sale.clearFilters")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.map((sale, idx) => (
            <SaleRow key={sale.id} sale={sale} isFirst={idx === 0} />
          ))}
        </div>
      )}
      </div>
    </PullToRefresh>
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
    isOverdue?: boolean;
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
          {formatDate(new Date(sale.date))} · {formatTime(new Date(sale.date))} ·{" "}
          <span className="font-mono text-[10px] text-slate-400">
            #{sale.id.slice(-6).toUpperCase()}
          </span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-slate-900">
          {formatMoney(sale.totalAmount)}
        </p>
        {hasOutstanding ? (
          <p
            className={cn(
              "text-[11px] font-medium",
              sale.isOverdue ? "text-red-700" : "text-red-600",
            )}
          >
            <Money value={outstanding.toString()} />{" "}
            {sale.isOverdue ? t("sale.overdue") : t("sale.due")}
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
 * Layout (vertical, centered, on a white card):
 *   1. Receipt illustration: white receipt with wavy bottom edge + faint green
 *      horizontal lines (representing text), overlaid with a solid green circle
 *      + white "+" badge at the bottom-right, with sparkle accents around it
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white px-6 py-12 text-center shadow-sm">
      {/* Receipt illustration with green circle + badge + sparkles */}
      <div className="relative mb-5">
        {/* Sparkle accents around the illustration */}
        <Sparkles className="absolute -left-4 -top-2 h-4 w-4 text-brand-300" aria-hidden />
        <Sparkles className="absolute -right-3 top-1 h-3 w-3 text-brand-200" aria-hidden />
        <Sparkles className="absolute -right-5 top-6 h-2.5 w-2.5 text-brand-200" aria-hidden />

        {/* Main icon container — light green circle with a receipt icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Receipt className="h-9 w-9 text-brand-600" strokeWidth={1.75} />
        </div>

        {/* Solid green circle + white "+" badge at bottom-right of the icon */}
        <div className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-sm">
          <Plus className="h-4 w-4" strokeWidth={3} />
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
