"use client";

/**
 * TransactionsList — the unified Transaction History view.
 *
 * Features:
 *   - Date filter chips: Today / Week / Month / All / Custom
 *   - Type filter chips: All / Sales / Payments / Expenses / Stock / Adjustments
 *   - Custom date range picker (when filter = 'custom')
 *   - Summary card: count + total in (payments) + total out (expenses + sales)
 *   - Each row: color-coded type icon, description (customer/product/notes),
 *     signed amount (green for in, red for out, neutral for stock moves),
 *     relative time
 *   - Tap → navigates to the appropriate detail page based on transaction type
 *
 * Mobile-first: filter chips horizontally scrollable, transaction rows are
 * compact and scannable.
 *
 * Data integrity:
 *   This view reads from the Transaction ledger (denormalized mirror).
 *   Source-of-truth records live in their specialized tables. No records are
 *   duplicated here — the ledger is updated atomically with each source write.
 */

import Link from "next/link";
import { useState } from "react";
import {
  AlertCircle,
  ShoppingCart,
  Wallet,
  Receipt,
  Package,
  Scale,
  Calendar,
} from "lucide-react";
import { useTransactionsList } from "@/hooks/use-transactions";
import type { TransactionFilter, TransactionType } from "@/lib/services/transactions";
import type { TransactionListItem } from "@/lib/services/transactions";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { formatRelative, formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

type DateFilterKey = "transactions.today" | "transactions.thisWeek" | "transactions.thisMonth" | "transactions.all" | "transactions.custom";
const DATE_FILTERS: Array<{ value: TransactionFilter; labelKey: DateFilterKey }> = [
  { value: "today", labelKey: "transactions.today" },
  { value: "week", labelKey: "transactions.thisWeek" },
  { value: "month", labelKey: "transactions.thisMonth" },
  { value: "all", labelKey: "transactions.all" },
  { value: "custom", labelKey: "transactions.custom" },
];

type TypeFilterKey = "transactions.allTypes" | "transactions.sales" | "transactions.payments" | "transactions.expenses" | "transactions.stock" | "transactions.adjustments";
const TYPE_FILTERS: Array<{ value: TransactionType | "all"; labelKey: TypeFilterKey }> = [
  { value: "all", labelKey: "transactions.allTypes" },
  { value: "sale", labelKey: "transactions.sales" },
  { value: "payment", labelKey: "transactions.payments" },
  { value: "expense", labelKey: "transactions.expenses" },
  { value: "stock_move", labelKey: "transactions.stock" },
  { value: "balance_adjustment", labelKey: "transactions.adjustments" },
];

type TxTypeInfo = {
  labelKey: TypeFilterKey;
  icon: typeof ShoppingCart;
  iconBg: string;
  iconColor: string;
  href: (tx: TransactionListItem) => string; // where to go when tapped
};

const TX_TYPE_INFO: Record<string, TxTypeInfo> = {
  sale: {
    labelKey: "transactions.sales",
    icon: ShoppingCart,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-700",
    href: (tx) => `/sales/${tx.refId}`,
  },
  payment: {
    labelKey: "transactions.payments",
    icon: Wallet,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-700",
    href: (tx) => `/payments/${tx.refId}`,
  },
  expense: {
    labelKey: "transactions.expenses",
    icon: Receipt,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    href: (tx) => `/more/expenses/${tx.refId}`,
  },
  stock_move: {
    labelKey: "transactions.stock",
    icon: Package,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-700",
    href: (tx) => tx.productId ? `/more/products/${tx.productId}` : "/stock",
  },
  balance_adjustment: {
    labelKey: "transactions.adjustments",
    icon: Scale,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-700",
    href: (tx) => tx.customerId ? `/khata/${tx.customerId}` : "/khata",
  },
};

function todayIsoLocal(): string {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

function daysAgoIsoLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  const local = new Date(d.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

export function TransactionsList() {
  const [filter, setFilter] = useState<TransactionFilter>("today");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [from, setFrom] = useState<string>(daysAgoIsoLocal(7));
  const [to, setTo] = useState<string>(todayIsoLocal());
  const { t } = useLanguage();

  // Only enable custom range inputs when filter='custom'
  const showCustomRange = filter === "custom";

  const { data, isLoading, isError, error, refetch } = useTransactionsList({
    filter,
    type: typeFilter === "all" ? undefined : typeFilter,
    from: showCustomRange ? from : undefined,
    to: showCustomRange ? to : undefined,
    includeSummary: true,
    limit: 200,
  });

  const transactions = data?.transactions ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-3">
      {/* Date filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DATE_FILTERS.map((f) => (
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

      {/* Custom date range picker */}
      {showCustomRange ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Calendar className="h-3.5 w-3.5" />
            {t("transactions.customDateRange")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-500">
                {t("transactions.from")}
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                max={to}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-500">
                {t("transactions.to")}
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min={from}
                max={todayIsoLocal()}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Type filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TYPE_FILTERS.map((tf) => (
          <button
            key={tf.value}
            type="button"
            onClick={() => setTypeFilter(tf.value)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              typeFilter === tf.value
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50",
            )}
          >
            {t(tf.labelKey)}
          </button>
        ))}
      </div>

      {/* Summary card */}
      {summary && summary.count > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {summary.count} {summary.count === 1 ? t("transactions.transaction") : t("transactions.transactions")}
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-brand-50 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-brand-700">{t("transactions.moneyIn")}</p>
              <p className="text-sm font-bold tabular-nums text-brand-700">
                <Money value={summary.totalIn} />
              </p>
            </div>
            <div className="rounded-lg bg-red-50 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-red-700">{t("transactions.moneyOut")}</p>
              <p className="text-sm font-bold tabular-nums text-red-700">
                <Money value={summary.totalOut} />
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Body */}
      {isLoading ? (
        <TransactionsListSkeleton />
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
      ) : transactions.length === 0 ? (
        <EmptyState
          title={t("transactions.noTransactions")}
          description={
            filter === "custom"
              ? `No transactions between ${formatDate(new Date(from))} and ${formatDate(new Date(to))}.`
              : "Try a different time range or type filter."
          }
          icon={<Receipt className="h-6 w-6" />}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {transactions.map((tx, idx) => (
            <TransactionRow key={tx.id} tx={tx} isFirst={idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  tx,
  isFirst,
}: {
  tx: TransactionListItem;
  isFirst: boolean;
}) {
  const { t } = useLanguage();
  const fallbackInfo: TxTypeInfo = {
    labelKey: "transactions.adjustments",
    icon: Scale,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-700",
    href: () => "/more/transactions" as string,
  };
  const info = TX_TYPE_INFO[tx.type] ?? TX_TYPE_INFO.balance_adjustment ?? fallbackInfo;
  const Icon = info.icon;

  // Determine the display amount + color
  // - payment: +X (green) — money received
  // - expense: -X (red) — money spent
  // - sale: X (slate, no sign) — full sale amount
  // - stock_move: X (slate) — movement cost or quantity
  // - balance_adjustment: ±X based on direction
  const isMoneyIn = tx.type === "payment";
  const isMoneyOut = tx.type === "expense";
  const isAdjustment = tx.type === "balance_adjustment";

  const amountDisplay = (() => {
    if (isMoneyIn) return { text: `+${tx.amount}`, color: "text-brand-700" };
    if (isMoneyOut) return { text: `-${tx.amount}`, color: "text-red-600" };
    if (isAdjustment) {
      const isDebit = tx.direction === "debit";
      return {
        text: `${isDebit ? "+" : "−"}${tx.amount}`,
        color: isDebit ? "text-red-600" : "text-brand-700",
      };
    }
    // Sale + stock_move
    return { text: tx.amount, color: "text-slate-900" };
  })();

  // Description (most relevant context for the user)
  const description = tx.customerName ?? tx.productName ?? tx.notes ?? t(info.labelKey);

  return (
    <Link
      href={info.href(tx)}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100",
        !isFirst && "border-t border-slate-100",
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", info.iconBg)}>
        <Icon className={cn("h-4 w-4", info.iconColor)} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-slate-900">
            {description}
          </p>
          <p className={cn("shrink-0 text-sm font-bold tabular-nums", amountDisplay.color)}>
            <Money value={amountDisplay.text.replace(/^[+\-]/, "")} />
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-slate-500">
            <span className="font-medium text-slate-600">{t(info.labelKey)}</span>
            {tx.productName ? <span> · {tx.productName}</span> : null}
          </p>
          <p className="shrink-0 text-[11px] text-slate-400">
            {formatRelative(new Date(tx.date))}
          </p>
        </div>
      </div>
    </Link>
  );
}

function TransactionsListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5",
              i > 0 && "border-t border-slate-100",
            )}
          >
            <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-3 w-14 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
