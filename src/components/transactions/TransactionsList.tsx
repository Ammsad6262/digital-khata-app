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
  Truck,
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

type TypeFilterKey = "transactions.allTypes" | "transactions.sales" | "transactions.payments" | "transactions.expenses" | "transactions.stock" | "transactions.supplierPayments" | "transactions.adjustments";
const TYPE_FILTERS: Array<{ value: TransactionType | "all"; labelKey: TypeFilterKey }> = [
  { value: "all", labelKey: "transactions.allTypes" },
  { value: "sale", labelKey: "transactions.sales" },
  { value: "payment", labelKey: "transactions.payments" },
  { value: "expense", labelKey: "transactions.expenses" },
  { value: "stock_move", labelKey: "transactions.stock" },
  { value: "supplier_payment", labelKey: "transactions.supplierPayments" },
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
    iconBg: "bg-info-soft",
    iconColor: "text-info-ink",
    href: (tx) => `/payments/${tx.refId}`,
  },
  expense: {
    labelKey: "transactions.expenses",
    icon: Receipt,
    iconBg: "bg-warning-soft",
    iconColor: "text-warning-ink",
    href: (tx) => `/more/expenses/${tx.refId}`,
  },
  stock_move: {
    labelKey: "transactions.stock",
    icon: Package,
    iconBg: "bg-accent-50",
    iconColor: "text-accent-700",
    href: (tx) => tx.productId ? `/more/products/${tx.productId}` : "/stock",
  },
  supplier_payment: {
    labelKey: "transactions.supplierPayments",
    icon: Truck,
    iconBg: "bg-warning-soft",
    iconColor: "text-warning-ink",
    href: (tx) => tx.supplierId ? `/more/suppliers/${tx.supplierId}` : "/more/suppliers",
  },
  balance_adjustment: {
    labelKey: "transactions.adjustments",
    icon: Scale,
    iconBg: "bg-surface-2",
    iconColor: "text-ink-muted",
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
                : "bg-surface text-ink-muted border border-line hover:bg-app",
            )}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* Custom date range picker */}
      {showCustomRange ? (
        <div className="rounded-card border border-line bg-surface shadow-card p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Calendar className="h-3.5 w-3.5" />
            {t("transactions.customDateRange")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-subtle">
                {t("transactions.from")}
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                max={to}
                className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-subtle">
                {t("transactions.to")}
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min={from}
                max={todayIsoLocal()}
                className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
                ? "bg-brand-700 text-white"
                : "bg-surface text-ink-muted border border-line hover:bg-app",
            )}
          >
            {t(tf.labelKey)}
          </button>
        ))}
      </div>

      {/* Summary card */}
      {summary && summary.count > 0 ? (
        <div className="rounded-card border border-line bg-surface shadow-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-subtle">
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
            <div className="rounded-lg bg-danger-soft px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-danger-ink">{t("transactions.moneyOut")}</p>
              <p className="text-sm font-bold tabular-nums text-danger-ink">
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
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
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
    iconBg: "bg-surface-2",
    iconColor: "text-ink-muted",
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
  const isMoneyOut = tx.type === "expense" || tx.type === "supplier_payment";
  const isAdjustment = tx.type === "balance_adjustment";

  const amountDisplay = (() => {
    if (isMoneyIn) return { text: `+${tx.amount}`, color: "text-brand-700" };
    if (isMoneyOut) return { text: `-${tx.amount}`, color: "text-danger-ink" };
    if (isAdjustment) {
      const isDebit = tx.direction === "debit";
      return {
        text: `${isDebit ? "+" : "−"}${tx.amount}`,
        color: isDebit ? "text-danger-ink" : "text-brand-700",
      };
    }
    // Sale + stock_move
    return { text: tx.amount, color: "text-ink" };
  })();

  // Description (most relevant context for the user)
  const description = tx.customerName ?? tx.productName ?? tx.notes ?? t(info.labelKey);

  return (
    <Link
      href={info.href(tx)}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 hover:bg-app active:bg-surface-2",
        !isFirst && "border-t border-line",
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", info.iconBg)}>
        <Icon className={cn("h-4 w-4", info.iconColor)} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink">
            {description}
          </p>
          <p className={cn("shrink-0 text-sm font-bold tabular-nums", amountDisplay.color)}>
            <Money value={amountDisplay.text.replace(/^[+\-]/, "")} />
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-ink-subtle">
            <span className="font-medium text-ink-muted">{t(info.labelKey)}</span>
            {tx.productName ? <span> · {tx.productName}</span> : null}
          </p>
          <p className="shrink-0 text-[11px] text-ink-faint">
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
      <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5",
              i > 0 && "border-t border-line",
            )}
          >
            <div className="h-9 w-9 animate-pulse rounded-lg bg-surface-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-surface-2" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="h-3 w-14 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
