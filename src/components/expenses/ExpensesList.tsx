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
import { useMemo, useState } from "react";
import { AlertCircle, Receipt, Search, X } from "lucide-react";
import { useExpensesList } from "@/hooks/use-expenses";
import type { ExpenseFilter } from "@/lib/services/expenses";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

type ExpenseFilterKey = "transactions.today" | "transactions.thisWeek" | "transactions.thisMonth" | "transactions.all";
const FILTERS: Array<{ value: ExpenseFilter; labelKey: ExpenseFilterKey }> = [
  { value: "today", labelKey: "transactions.today" },
  { value: "week", labelKey: "transactions.thisWeek" },
  { value: "month", labelKey: "transactions.thisMonth" },
  { value: "all", labelKey: "transactions.all" },
];

type CategoryKey = "expense.transport" | "expense.shop" | "expense.electricity" | "expense.packaging" | "expense.salary" | "expense.rent" | "payment.other";
const CATEGORY_BADGES: Record<string, { labelKey: CategoryKey; bg: string; text: string; icon: string }> = {
  transport:   { labelKey: "expense.transport",   bg: "bg-info-soft",   text: "text-info-ink",   icon: "🚚" },
  shop:        { labelKey: "expense.shop",        bg: "bg-accent-50", text: "text-accent-700", icon: "🏪" },
  electricity: { labelKey: "expense.electricity", bg: "bg-warning-soft",  text: "text-warning-ink",  icon: "💡" },
  packaging:   { labelKey: "expense.packaging",   bg: "bg-warning-soft", text: "text-warning-ink", icon: "📦" },
  salary:      { labelKey: "expense.salary",      bg: "bg-success-soft",  text: "text-success-ink",  icon: "👷" },
  rent:        { labelKey: "expense.rent",         bg: "bg-danger-soft",    text: "text-danger-ink",    icon: "🏠" },
  other:       { labelKey: "payment.other",        bg: "bg-surface-2", text: "text-ink-muted", icon: "•" },
};

export function ExpensesList() {
  const [filter, setFilter] = useState<ExpenseFilter>("today");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const { data, isLoading, isError, error, refetch } = useExpensesList(filter);
  const { t } = useLanguage();

  const categories = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((expense) => expense.category))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.filter((expense) => {
      if (category !== "all" && expense.category !== category) return false;
      if (query) {
        const haystack = `${expense.name} ${expense.notes ?? ""} ${expense.category}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [data, search, category]);

  // Compute summary stats for the selected date + search/category filters.
  const summary = (() => {
    if (filtered.length === 0) return { count: 0, total: new Decimal(0) };
    let total = new Decimal(0);
    for (const e of filtered) {
      total = total.plus(new Decimal(e.amount));
    }
    return { count: filtered.length, total };
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
                : "bg-surface text-ink-muted border border-line hover:bg-app",
            )}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* Search by name, note, or category */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("expense.searchPlaceholder")}
          aria-label={t("expense.searchPlaceholder")}
          className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-9 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label={t("common.clearSearchAria")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Category chips — only categories that appear in this period */}
      {categories.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategory("all")}
            aria-pressed={category === "all"}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              category === "all"
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-line bg-surface text-ink-muted hover:bg-app",
            )}
          >
            {t("expense.filterAll")}
          </button>
          {categories.map((value) => {
            const badge = CATEGORY_BADGES[value];
            const active = category === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  active
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-line bg-surface text-ink-muted hover:bg-app",
                )}
              >
                {badge ? t(badge.labelKey) : value}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Summary */}
      {filtered.length > 0 ? (
        <div className="rounded-card border border-line bg-surface shadow-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-subtle">
              {summary.count} {t("transactions.expenses")}
            </span>
            <span className="font-medium text-ink-muted">
              {t("expense.total")} <Money value={summary.total.toString()} />
            </span>
          </div>
        </div>
      ) : null}

      {/* Body */}
      {isLoading ? (
        <ExpensesListSkeleton />
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
                <Receipt className="h-4 w-4" />
                {t("action.addExpense")}
              </Button>
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t("expense.noMatches")}
          description={t("expense.noMatchesDesc")}
          icon={<Search className="h-6 w-6" />}
          action={
            <Button
              onClick={() => {
                setSearch("");
                setCategory("all");
              }}
              variant="outline"
              size="sm"
            >
              {t("expense.clearFilters")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {filtered.map((expense, idx) => (
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
  const { t } = useLanguage();
  const fallbackBadge = { labelKey: "payment.other" as CategoryKey, bg: "bg-surface-2", text: "text-ink-muted", icon: "•" };
  const badge = CATEGORY_BADGES[expense.category] ?? CATEGORY_BADGES.other ?? fallbackBadge;

  return (
    <Link
      href={`/more/expenses/${expense.id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-3 hover:bg-app active:bg-surface-2",
        !isFirst && "border-t border-line",
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
        <p className="truncate text-sm font-medium text-ink">
          {expense.name}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[10px] font-medium",
              badge.bg,
              badge.text,
            )}
          >
            {t(badge.labelKey)}
          </span>
          <span>·</span>
          <span>
            {formatDate(new Date(expense.date))} · {formatTime(new Date(expense.date))}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-danger-ink">
          -{formatMoney(expense.amount)}
        </p>
      </div>
    </Link>
  );
}

function ExpensesListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-12 animate-pulse rounded-xl bg-surface-2" />
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 px-3 py-3",
              i > 0 && "border-t border-line",
            )}
          >
            <div className="h-10 w-10 animate-pulse rounded-lg bg-surface-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-surface-2" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
