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
  Phone,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useOutstandingCustomers } from "@/hooks/use-customers";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/providers/language-provider";
import { formatRelative, formatDate } from "@/lib/utils/date";
import { Decimal } from "@/lib/utils/decimal";

export function OutstandingCustomersList() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOutstandingCustomers();
  const { t, lang } = useLanguage();

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
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-red-700/80">
              {t("outstanding.totalOwed")}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-red-700">
              <Money value={totalOwed.toString()} />
            </p>
            <p className="mt-1.5 text-xs text-red-700/70">
              <span className="font-semibold text-red-700">{data.length}</span>{" "}
              {data.length === 1
                ? t("outstanding.customerCountOne")
                : t("outstanding.customerCount")}
            </p>
          </div>
          <div className="rounded-xl bg-white/60 p-2 text-red-700">
            <Users className="h-5 w-5" />
          </div>
        </div>
        {isFetching ? (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-red-700/60">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {t("dashboard.updating")}
          </p>
        ) : null}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("outstanding.title")}
        </h2>
        <span className="text-[11px] text-slate-400">
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

          return (
            <Link
              key={c.id}
              href={`/khata/${c.id}`}
              className="block overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-brand-300 hover:bg-brand-50/30 active:bg-brand-50/60"
            >
              {/* Top row: avatar + name + phone + balance */}
              <div className="flex items-center gap-3 px-3 py-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700"
                  aria-hidden
                >
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    <span className="mr-1.5 text-slate-400">#{idx + 1}</span>
                    {c.name}
                  </p>
                  {c.phone ? (
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="h-3 w-3" />
                      {c.phone}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-300">No phone</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold tabular-nums text-red-600">
                    <Money value={c.balance} />
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-red-500/80">
                    {t("customer.owes")}
                  </p>
                </div>
              </div>

              {/* Bottom row: stats grid — opening / sales / payments / last activity */}
              <div className="grid grid-cols-4 gap-1 border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-center">
                <Stat
                  label={t("customer.outstandingBalance")}
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
                    <span className="text-[11px] font-medium text-slate-700">
                      {lastActivity}
                    </span>
                  }
                />
              </div>

              {/* Footer: customer since + CTA */}
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400">
                <span>
                  {t("outstanding.openedOn")}: {since}
                </span>
                <span className="font-medium text-brand-600">
                  {t("outstanding.viewKhata")} →
                </span>
              </div>
            </Link>
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
    slate: "text-slate-700",
    green: "text-green-700",
    blue: "text-blue-700",
  }[tone];

  return (
    <div className="px-1">
      <p className="flex items-center justify-center gap-0.5 text-[9px] font-medium uppercase tracking-wider text-slate-400">
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
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
    </div>
  );
}
