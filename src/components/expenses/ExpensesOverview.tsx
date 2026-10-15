"use client";

/**
 * ExpensesOverview — the new main Expenses page body.
 *
 * Layout (top to bottom):
 *   1. Period filter chips: Today / This Week / This Month / All
 *   2. Summary cards (grid on sm+):
 *        - Total for selected period (large, primary)
 *        - Today's expenses
 *        - This month's expenses
 *   3. Category breakdown (list with bar + percentage)
 *   4. Recent expenses (5 most recent, with "View all" link to /more/expenses)
 *
 * All totals + breakdown come from /api/expenses/summary (server-aggregated,
 * decimal-safe). The list comes from /api/expenses?filter=...
 *
 * Loading + error + empty states handled.
 */

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Receipt, Plus, ChevronRight, TrendingUp } from "lucide-react";
import { useExpensesList, useExpensesSummary } from "@/hooks/use-expenses";
import type { ExpenseFilter } from "@/lib/services/expenses";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

type FilterLabelKey =
  | "transactions.today"
  | "transactions.thisWeek"
  | "transactions.thisMonth"
  | "transactions.all";
const FILTERS: Array<{ value: ExpenseFilter; labelKey: FilterLabelKey }> = [
  { value: "today", labelKey: "transactions.today" },
  { value: "week", labelKey: "transactions.thisWeek" },
  { value: "month", labelKey: "transactions.thisMonth" },
  { value: "all", labelKey: "transactions.all" },
];

type CategoryLabelKey =
  | "expense.transport"
  | "expense.shop"
  | "expense.electricity"
  | "expense.packaging"
  | "expense.salary"
  | "expense.rent"
  | "payment.other";

const CATEGORY_META: Record<string, { labelKey: CategoryLabelKey; bg: string; text: string; icon: string; bar: string }> = {
  transport:   { labelKey: "expense.transport",   bg: "bg-blue-50",   text: "text-blue-700",   icon: "🚚", bar: "bg-blue-500" },
  shop:        { labelKey: "expense.shop",        bg: "bg-purple-50", text: "text-purple-700", icon: "🏪", bar: "bg-purple-500" },
  electricity: { labelKey: "expense.electricity", bg: "bg-amber-50",  text: "text-amber-700",  icon: "💡", bar: "bg-amber-500" },
  packaging:   { labelKey: "expense.packaging",   bg: "bg-orange-50", text: "text-orange-700", icon: "📦", bar: "bg-orange-500" },
  salary:      { labelKey: "expense.salary",      bg: "bg-green-50",  text: "text-green-700",  icon: "👷", bar: "bg-green-500" },
  rent:        { labelKey: "expense.rent",         bg: "bg-red-50",    text: "text-red-700",    icon: "🏠", bar: "bg-red-500" },
  other:       { labelKey: "payment.other",         bg: "bg-slate-100", text: "text-slate-700", icon: "•", bar: "bg-slate-400" },
};

/** Get category metadata with a guaranteed fallback (noUncheckedIndexedAccess safe). */
function getCategoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.other!;
}

export function ExpensesOverview() {
  const [filter, setFilter] = useState<ExpenseFilter>("today");
  const summaryQuery = useExpensesSummary(filter);
  const listQuery = useExpensesList(filter);
  const { t } = useLanguage();

  const summary = summaryQuery.data;
  const recentList = listQuery.data?.slice(0, 5) ?? [];

  return (
    <div className="space-y-4">
      {/* ── Period filter chips ─────────────────────────────────────────── */}
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

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      {summaryQuery.isLoading ? (
        <SummaryCardsSkeleton />
      ) : summaryQuery.isError ? (
        <EmptyState
          title={t("common.couldntLoad")}
          description={summaryQuery.error instanceof Error ? summaryQuery.error.message : t("common.networkError")}
          icon={<AlertCircle className="h-6 w-6" />}
          action={
            <Button onClick={() => summaryQuery.refetch()} variant="outline" size="sm">
              {t("common.retry")}
            </Button>
          }
        />
      ) : summary ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {/* Period total — primary, takes 2 cols on mobile */}
          <SummaryCard
            label={t("expense.totalForPeriod")}
            value={summary.total}
            count={summary.count}
            tone="primary"
            className="col-span-2 sm:col-span-1 sm:row-span-2"
          />
          <SummaryCard
            label={t("expense.todaysTotal")}
            value={summary.todayTotal}
            count={summary.todayCount}
            tone="today"
          />
          <SummaryCard
            label={t("expense.monthTotal")}
            value={summary.monthTotal}
            count={summary.monthCount}
            tone="month"
          />
        </div>
      ) : null}

      {/* ── Category breakdown ─────────────────────────────────────────── */}
      {summary && summary.byCategory.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
              {t("expense.byCategory")}
            </h2>
            <span className="text-[11px] text-slate-400">
              {summary.byCategory.length} {summary.byCategory.length === 1 ? t("expense.category") : t("expense.categories")}
            </span>
          </div>
          <div className="space-y-2">
            {summary.byCategory.map((cat) => {
              const meta = getCategoryMeta(cat.category);
              return (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs", meta.bg)}>
                        {meta.icon}
                      </span>
                      <span className="font-medium text-slate-700">{t(meta.labelKey)}</span>
                      <span className="text-slate-400">· {cat.count}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold tabular-nums text-slate-900">{formatMoney(cat.total)}</span>
                      <span className="text-[10px] text-slate-400">{cat.percentage}%</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn("h-full rounded-full transition-all", meta.bar)}
                      style={{ width: `${Math.max(2, cat.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── Recent expenses ────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="px-1 text-sm font-semibold text-slate-700">{t("expense.recent")}</h2>
          {listQuery.data && listQuery.data.length > 5 ? (
            <Link
              href="/more/expenses"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              {t("expense.viewAll")} <ChevronRight className="inline h-3 w-3 rtl-flip" />
            </Link>
          ) : null}
        </div>

        {listQuery.isLoading ? (
          <RecentListSkeleton />
        ) : listQuery.isError ? (
          <EmptyState
            title={t("common.couldntLoad")}
            description={listQuery.error instanceof Error ? listQuery.error.message : t("common.networkError")}
            icon={<AlertCircle className="h-6 w-6" />}
            action={
              <Button onClick={() => listQuery.refetch()} variant="outline" size="sm">
                {t("common.retry")}
              </Button>
            }
          />
        ) : recentList.length === 0 ? (
          <EmptyState
            title={filter === "all" ? t("expense.noExpenses") : t("expense.noExpensesPeriod")}
            description={
              filter === "all"
                ? t("expense.noExpensesDesc")
                : t("expense.noExpensesPeriodDesc")
            }
            icon={<Receipt className="h-6 w-6" />}
            action={
              <Link href="/more/expenses/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  {t("action.addExpense")}
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {recentList.map((expense, idx) => (
              <RecentExpenseRow key={expense.id} expense={expense} isFirst={idx === 0} />
            ))}
          </div>
        )}
      </section>

      {/* ── "Record new expense" CTA ───────────────────────────────────── */}
      <Link
        href="/more/expenses/new"
        className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.99]"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        {t("expense.recordNew")}
      </Link>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  count,
  tone,
  className,
}: {
  label: string;
  value: string;
  count: number;
  tone: "primary" | "today" | "month";
  className?: string;
}) {
  const { t } = useLanguage();
  // Convert "0" / "0.00" strings to a Decimal for safe display
  const v = new Decimal(value);
  const isZero = v.isZero();

  const toneClasses = {
    primary: "bg-gradient-to-br from-slate-900 to-slate-700 text-white",
    today: "bg-white border border-slate-200 text-slate-900",
    month: "bg-white border border-slate-200 text-slate-900",
  }[tone];

  return (
    <div className={cn("rounded-2xl p-3 shadow-sm", toneClasses, className)}>
      <p className={cn("text-[11px] font-medium uppercase tracking-wide", tone === "primary" ? "text-slate-300" : "text-slate-500")}>
        {label}
      </p>
      <p className={cn(
        "mt-1 text-2xl font-bold tabular-nums",
        tone === "primary" ? "text-white" : isZero ? "text-slate-400" : "text-red-600",
      )}>
        {tone === "primary" ? (
          // For the primary card, show the value as a Money (no red color)
          <span className="text-white">{formatMoney(value)}</span>
        ) : (
          formatMoney(value)
        )}
      </p>
      <p className={cn("mt-0.5 text-[11px]", tone === "primary" ? "text-slate-300" : "text-slate-400")}>
        {count} {count === 1 ? t("expense.expense") : t("expense.expenses")}
      </p>
    </div>
  );
}

function RecentExpenseRow({
  expense,
  isFirst,
}: {
  expense: {
    id: string;
    name: string;
    amount: string;
    category: string;
    notes: string | null;
    date: string | Date;
  };
  isFirst: boolean;
}) {
  const { t } = useLanguage();
  const meta = getCategoryMeta(expense.category);

  return (
    <Link
      href={`/more/expenses/${expense.id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-3 hover:bg-slate-50 active:bg-slate-100",
        !isFirst && "border-t border-slate-100",
      )}
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base", meta.bg)}>
        {meta.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{expense.name}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className={cn("rounded px-1 py-0.5 text-[10px] font-medium", meta.bg, meta.text)}>
            {t(meta.labelKey)}
          </span>
          <span>·</span>
          <span>{formatDate(new Date(expense.date))} · {formatTime(new Date(expense.date))}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-red-600">-{formatMoney(expense.amount)}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      <div className="col-span-2 h-24 animate-pulse rounded-2xl bg-slate-200 sm:col-span-1 sm:row-span-2" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}

function RecentListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {[0, 1, 2, 3].map((i) => (
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
  );
}
