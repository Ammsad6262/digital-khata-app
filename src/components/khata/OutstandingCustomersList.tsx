"use client";

/**
 * OutstandingCustomersList — shows every customer who currently owes money.
 *
 * Each row shows:
 *   - Avatar (initial)
 *   - Name + phone
 *   - Current balance (big, red)
 *   - Lifetime totals (sales, payments, opening)
 *   - Last activity date (relative)
 *   - Customer since date
 *
 * Tapping a row navigates to /khata/[id] (the full customer ledger with
 * running balance + every sale / payment / adjustment).
 *
 * If no one owes money → celebratory empty state.
 */

import Link from "next/link";
import {
  AlertCircle,
  ChevronRight,
  Phone,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useOutstandingCustomers } from "@/hooks/use-customers";
import { Money } from "@/components/shared/Money";
import { ContactActions } from "@/components/shared/ContactActions";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/providers/language-provider";
import { formatRelative, formatDate } from "@/lib/utils/date";
import { Decimal } from "@/lib/utils/decimal";
import { formatMoney } from "@/lib/utils/money";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";

export function OutstandingCustomersList() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOutstandingCustomers();
  const { t, tParams, lang } = useLanguage();
  const symbol = useCurrencySymbol();

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return <OutstandingSkeleton />;
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <EmptyState
        title={t("common.couldntLoad")}
        description={
          error instanceof Error ? error.message : t("common.networkError")
        }
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  // ── Empty state — no one owes money (celebratory!) ─────────────────────────
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={t("outstanding.noOne")}
        description={t("outstanding.noOneDesc")}
        icon={<Wallet className="h-6 w-6" />}
      />
    );
  }

  // ── Compute summary: total owed + customer count ───────────────────────────
  const totalOwed = data.reduce(
    (sum, c) => sum.plus(new Decimal(c.balance)),
    new Decimal(0),
  );

  return (
    <div className="space-y-3">
      {/* Summary banner — total owed + customer count + refresh spinner */}
      <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-danger-soft to-warning-soft p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-danger-ink/80">
              {t("outstanding.totalOwed")}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-danger-ink">
              <Money value={totalOwed.toString()} />
            </p>
            <p className="mt-1.5 text-xs text-danger-ink/70">
              <span className="font-semibold text-danger-ink">{data.length}</span>{" "}
              {data.length === 1
                ? t("outstanding.customerCountOne")
                : t("outstanding.customerCount")}
            </p>
          </div>
          <div className="rounded-xl bg-surface/60 p-2 text-danger-ink">
            <Users className="h-5 w-5" />
          </div>
        </div>
        {isFetching ? (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-danger-ink/60">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {t("dashboard.updating")}
          </p>
        ) : null}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-ink-muted">
          {t("outstanding.title")}
        </h2>
        <span className="text-[11px] text-ink-faint">
          {t("outstanding.subtitle")}
        </span>
      </div>

      {/* Customer cards — sorted by balance descending (server already sorts) */}
      <div className="space-y-2.5">
        {data.map((c, idx) => {
          const lastActivity = c.lastActivityAt
            ? formatRelative(new Date(c.lastActivityAt))
            : "—";
          const since = formatDate(new Date(c.createdAt));
          const whatsappMessage = tParams("customer.followUpMessage", {
            name: c.name,
            amount: formatMoney(c.balance, symbol),
          });

          return (
            <div
              key={c.id}
              className="overflow-hidden rounded-card border border-line bg-surface shadow-card transition-colors hover:border-brand-300"
            >
              {/* Top row: avatar + name + phone + balance + follow-up actions */}
              <div className="flex items-center gap-2 px-3 py-3">
                <Link
                  href={`/khata/${c.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-sm font-bold text-danger-ink"
                    aria-hidden
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      <span className="mr-1.5 text-ink-faint">#{idx + 1}</span>
                      {c.name}
                    </p>
                    {c.phone ? (
                      <p className="flex items-center gap-1 text-xs text-ink-subtle">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-faint">{t("customer.noPhone")}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold tabular-nums text-danger-ink">
                      <Money value={c.balance} />
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-danger/80">
                      {t("customer.owes")}
                    </p>
                  </div>
                </Link>
                <ContactActions
                  phone={c.phone}
                  whatsappMessage={whatsappMessage}
                  iconOnly
                />
              </div>

              <Link
                href={`/khata/${c.id}`}
                className="block hover:bg-brand-50/30 active:bg-brand-50/60"
              >
                {/* Bottom row: stats grid — opening / sales / payments / last activity */}
                <div className="grid grid-cols-4 gap-1 border-t border-line bg-app/60 px-3 py-2 text-center">
                  <Stat
                    label={t("customer.opening")}
                    value={<Money value={c.openingBalance} />}
                    icon={<Wallet className="h-3 w-3" />}
                  />
                  <Stat
                    label={t("dashboard.todaysSales")}
                    value={<Money value={c.totalSales} />}
                    icon={<TrendingUp className="h-3 w-3" />}
                    tone="green"
                  />
                  <Stat
                    label={t("dashboard.todaysPayments")}
                    value={<Money value={c.totalPayments} />}
                    icon={<TrendingDown className="h-3 w-3" />}
                    tone="blue"
                  />
                  <Stat
                    label={t("outstanding.lastActivity")}
                    value={
                      <span className="text-[11px] font-medium text-ink-muted">
                        {lastActivity}
                      </span>
                    }
                  />
                </div>

                {/* Footer: customer since + CTA */}
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-ink-faint">
                  <span>
                    {t("outstanding.openedOn")}: {since}
                  </span>
                  <span className="font-medium text-brand-600">
                    {t("outstanding.viewKhata")} <ChevronRight className="inline h-3 w-3 rtl-flip" />
                  </span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Small stat tile used inside each customer card
// ────────────────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  icon,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "slate" | "green" | "blue";
}) {
  const toneClass = {
    slate: "text-ink-muted",
    green: "text-success-ink",
    blue: "text-info-ink",
  }[tone];

  return (
    <div className="px-1">
      <p className="flex items-center justify-center gap-0.5 text-[9px] font-medium uppercase tracking-wider text-ink-faint">
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 text-xs font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ────────────────────────────────────────────────────────────────────────────

function OutstandingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-card border border-line bg-surface-2"
          />
        ))}
      </div>
    </div>
  );
}
