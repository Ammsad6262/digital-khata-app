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
import { useMemo, useState } from "react";
import { AlertCircle, Search, Wallet, X } from "lucide-react";
import { usePaymentsList } from "@/hooks/use-payments";
import type { PaymentFilter } from "@/lib/services/payments";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

type PaymentFilterKey = "transactions.today" | "transactions.thisWeek" | "transactions.thisMonth" | "transactions.all";
const FILTERS: Array<{ value: PaymentFilter; labelKey: PaymentFilterKey }> = [
  { value: "today", labelKey: "transactions.today" },
  { value: "week", labelKey: "transactions.thisWeek" },
  { value: "month", labelKey: "transactions.thisMonth" },
  { value: "all", labelKey: "transactions.all" },
];

type MethodLabelKey = "payment.cash" | "payment.bank" | "payment.cheque" | "payment.jazzcash" | "payment.easypaisa" | "payment.other";
const METHOD_BADGES: Record<string, { labelKey: MethodLabelKey; bg: string; text: string }> = {
  cash:      { labelKey: "payment.cash",      bg: "bg-brand-50",  text: "text-brand-700" },
  bank:      { labelKey: "payment.bank",      bg: "bg-info-soft",   text: "text-info-ink" },
  cheque:    { labelKey: "payment.cheque",    bg: "bg-accent-50", text: "text-accent-700" },
  jazzcash:  { labelKey: "payment.jazzcash",  bg: "bg-warning-soft", text: "text-warning-ink" },
  easypaisa: { labelKey: "payment.easypaisa", bg: "bg-success-soft",  text: "text-success-ink" },
  other:     { labelKey: "payment.other",     bg: "bg-surface-2", text: "text-ink-muted" },
};

export function PaymentsList() {
  const [filter, setFilter] = useState<PaymentFilter>("today");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const { data, isLoading, isError, error, refetch } = usePaymentsList(filter);
  const { t } = useLanguage();

  const methods = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((payment) => payment.method))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.filter((payment) => {
      if (method !== "all" && payment.method !== method) return false;
      if (query) {
        const haystack =
          `${payment.customerName} ${payment.customerPhone ?? ""} ${payment.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [data, search, method]);

  // Compute summary stats for the selected date + search/method filters.
  const summary = (() => {
    if (filtered.length === 0) return { count: 0, total: new Decimal(0) };
    let total = new Decimal(0);
    for (const p of filtered) {
      total = total.plus(new Decimal(p.amount));
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

      {/* Search by customer, phone, or payment ID */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("payment.searchPlaceholder")}
          aria-label={t("payment.searchPlaceholder")}
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

      {/* Payment-method chips — only methods present in this period */}
      {methods.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setMethod("all")}
            aria-pressed={method === "all"}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              method === "all"
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-line bg-surface text-ink-muted hover:bg-app",
            )}
          >
            {t("payment.allMethods")}
          </button>
          {methods.map((value) => {
            const active = method === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setMethod(value)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-line bg-surface text-ink-muted hover:bg-app",
                )}
              >
                {t(`method.${value}` as TranslationKey)}
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
              {summary.count} {t("transactions.payments")}
            </span>
            <span className="font-medium text-ink-muted">
              {t("payment.totalReceived")} <Money value={summary.total.toString()} />
            </span>
          </div>
        </div>
      ) : null}

      {/* Body */}
      {isLoading ? (
        <PaymentsListSkeleton />
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
          title={filter === "all" ? t("payment.noPayments") : t("payment.noPaymentsPeriod")}
          description={
            filter === "all"
              ? t("payment.noPaymentsDesc")
              : t("payment.noPaymentsPeriodDesc")
          }
          icon={<Wallet className="h-6 w-6" />}
          action={
            <Link href="/payments/new">
              <Button size="sm">
                <Wallet className="h-4 w-4" />
                {t("action.addPayment")}
              </Button>
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t("payment.noMatches")}
          description={t("payment.noMatchesDesc")}
          icon={<Search className="h-6 w-6" />}
          action={
            <Button
              onClick={() => {
                setSearch("");
                setMethod("all");
              }}
              variant="outline"
              size="sm"
            >
              {t("payment.clearFilters")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {filtered.map((payment, idx) => (
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
    customerPhone: string | null;
    amount: string;
    method: string;
    notes: string | null;
    date: string | Date;
  };
  isFirst: boolean;
}) {
  const { t } = useLanguage();
  const fallbackBadge = { labelKey: "payment.other" as MethodLabelKey, bg: "bg-surface-2", text: "text-ink-muted" };
  const methodBadge = METHOD_BADGES[payment.method] ?? METHOD_BADGES.other ?? fallbackBadge;

  return (
    <Link
      href={`/payments/${payment.id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-3 hover:bg-app active:bg-surface-2",
        !isFirst && "border-t border-line",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
        <Wallet className="h-5 w-5 text-brand-700" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {payment.customerName}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[10px] font-medium",
              methodBadge.bg,
              methodBadge.text,
            )}
          >
            {t(methodBadge.labelKey)}
          </span>
          <span>·</span>
          <span>
            {formatDate(new Date(payment.date))} · {formatTime(new Date(payment.date))} ·{" "}
            <span className="font-mono text-[10px] text-ink-faint">
              #{payment.id.slice(-6).toUpperCase()}
            </span>
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
