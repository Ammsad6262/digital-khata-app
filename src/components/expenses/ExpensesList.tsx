"use client";

/**
 * ExpensesList — client component for the Expenses page.
 *
 * Features:
 *   - Date filter chips: Today / Week / Month / All
 *   - Summary card: count + total for the selected period
 *   - Each row: name, date/time, amount (-red), category badge
 *   - Tap → /more/expenses/[id]
 *   - Loading skeleton, empty state, error retry
 */

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Receipt } from "lucide-react";
import { useExpensesList } from "@/hooks/use-expenses";
import type { ExpenseFilter } from "@/lib/services/expenses";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const FILTERS: Array<{ value: ExpenseFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All" },
];

const CATEGORY_BADGES: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  transport:   { label: "Transport",   bg: "bg-blue-50",   text: "text-blue-700",   icon: "🚚" },
  shop:        { label: "Shop",        bg: "bg-purple-50", text: "text-purple-700", icon: "🏪" },
  electricity: { label: "Electricity", bg: "bg-amber-50",  text: "text-amber-700",  icon: "💡" },
  packaging:   { label: "Packaging",   bg: "bg-orange-50", text: "text-orange-700", icon: "📦" },
  salary:      { label: "Salary",      bg: "bg-green-50",  text: "text-green-700",  icon: "👷" },
  rent:        { label: "Rent",         bg: "bg-red-50",    text: "text-red-700",    icon: "🏠" },
  other:       { label: "Other",        bg: "bg-slate-100", text: "text-slate-700", icon: "•" },
};

export function ExpensesList() {
  const [filter, setFilter] = useState<ExpenseFilter>("today");
  const { data, isLoading, isError, error, refetch } = useExpensesList(filter);

  // Compute summary stats for the selected filter.
  const summary = (() => {
    if (!data || data.length === 0) return { count: 0, total: new Decimal(0) };
    let total = new Decimal(0);
    for (const e of data) {
      total = total.plus(new Decimal(e.amount));
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
              {summary.count} {summary.count === 1 ? "expense" : "expenses"}
            </span>
            <span className="font-medium text-slate-700">
              Total: <Money value={summary.total.toString()} />
            </span>
          </div>
        </div>
      ) : null}

      {/* Body */}
      {isLoading ? (
        <ExpensesListSkeleton />
      ) : isError ? (
        <EmptyState
          title="Couldn't load expenses"
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
          title={`No expenses ${filter === "all" ? "yet" : "in this period"}`}
          description={
            filter === "all"
              ? "Record your first expense using the + button above."
              : "Try a different time range, or record a new expense."
          }
          icon={<Receipt className="h-6 w-6" />}
          action={
            <Link href="/more/expenses/new">
              <Button size="sm">
                <Receipt className="h-4 w-4" />
                Add Expense
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {data.map((expense, idx) => (
            <ExpenseRow key={expense.id} expense={expense} isFirst={idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseRow({
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
  const badge = CATEGORY_BADGES[expense.category] ?? CATEGORY_BADGES.other ?? {
    label: "Other", bg: "bg-slate-100", text: "text-slate-700", icon: "•",
  };

  return (
    <Link
      href={`/more/expenses/${expense.id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-3 hover:bg-slate-50 active:bg-slate-100",
        !isFirst && "border-t border-slate-100",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base",
          badge.bg,
        )}
      >
        {badge.icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {expense.name}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[10px] font-medium",
              badge.bg,
              badge.text,
            )}
          >
            {badge.label}
          </span>
          <span>·</span>
          <span>
            {formatDate(new Date(expense.date))} · {formatTime(new Date(expense.date))}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-red-600">
          -{formatMoney(expense.amount)}
        </p>
      </div>
    </Link>
  );
}

function ExpensesListSkeleton() {
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
