"use client";

/**
 * CustomerDetail — the per-customer khata view.
 *
 * Shows:
 *   - Customer info card (name, phone, address, notes)
 *   - Balance summary (current balance + total purchases / payments / adjustments)
 *   - Complete transaction history with running balance after each entry
 *   - Each transaction row is color-coded by type (sale/payment/adjustment)
 *
 * Handles loading (skeleton), error (retry), and not-found states.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  AlertCircle,
  Phone,
  MapPin,
  StickyNote,
  ShoppingCart,
  Wallet,
  Scale,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useCustomerHistory, useDeleteCustomer } from "@/hooks/use-customers";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { DeleteButton } from "@/components/shared/DeleteButton";
import { Button } from "@/components/ui/Button";
import { Decimal } from "@/lib/utils/decimal";
import { formatDate, formatTime } from "@/lib/utils/date";
import type {
  CustomerTransaction,
} from "@/lib/services/customers";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export function CustomerDetail({ customerId }: { customerId: string }) {
  const { data, isLoading, isError, error, refetch } = useCustomerHistory(customerId);
  const deleteCustomer = useDeleteCustomer();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useLanguage();

  if (isLoading) {
    return <CustomerDetailSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        title={t("customer.couldntLoadCustomer")}
        description={
          error instanceof Error
            ? error.message
            : t("common.networkError")
        }
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm">
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title={t("customer.notFound")}
        description={t("customer.notFoundDesc")}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Link href="/khata">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Button>
          </Link>
        }
      />
    );
  }

  const { customer, transactions } = data;
  const currentBalance = new Decimal(customer.balance);
  const isOwed = currentBalance.gt(0);
  return (
    <div className="space-y-4">
      {/* Customer info + balance hero */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className={cn(
            "p-4 text-white",
            isOwed
              ? "bg-gradient-to-br from-red-500 to-red-600"
              : currentBalance.lt(0)
                ? "bg-gradient-to-br from-blue-500 to-blue-600"
                : "bg-gradient-to-br from-slate-600 to-slate-700",
          )}
        >
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">
            {isOwed ? t("customer.outstandingBalance") : currentBalance.lt(0) ? t("customer.advancePayment") : t("customer.settled")}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            <Money value={currentBalance.abs().toString()} />
          </p>
        </div>

        <div className="space-y-2.5 p-4">
          <h2 className="text-base font-semibold text-slate-900">{customer.name}</h2>

          <div className="space-y-1.5 text-sm">
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
              >
                <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                {customer.phone}
              </a>
            ) : null}

            {customer.address ? (
              <p className="flex items-start gap-2 text-slate-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                {customer.address}
              </p>
            ) : null}

            {customer.notes ? (
              <p className="flex items-start gap-2 text-slate-600">
                <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                {customer.notes}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Balance summary — 3 stat tiles */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryTile
          label={t("customer.purchases")}
          value={customer.totalPurchases}
          icon={<TrendingUp className="h-3 w-3" />}
          tone="red"
        />
        <SummaryTile
          label={t("customer.payments")}
          value={customer.totalPayments}
          icon={<TrendingDown className="h-3 w-3" />}
          tone="green"
        />
        <SummaryTile
          label={t("customer.opening")}
          value={customer.openingBalance}
          icon={<Scale className="h-3 w-3" />}
          tone="slate"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/sales/new?customerId=${customer.id}`}>
          <Button className="w-full" variant="primary" size="md">
            <ShoppingCart className="h-4 w-4" />
            {t("action.newSale")}
          </Button>
        </Link>
        <Link href={`/payments/new?customerId=${customer.id}`}>
          <Button className="w-full" variant="outline" size="md">
            <Wallet className="h-4 w-4" />
            {t("action.addPayment")}
          </Button>
        </Link>
      </div>

      {/* Transaction history */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-slate-700">
            {t("customer.transactionHistory")}
          </h3>
          <span className="text-xs text-slate-500">
            {transactions.length} {transactions.length === 1 ? t("customer.entry") : t("customer.entries")}
          </span>
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            title={t("customer.noTransactions")}
            description={t("customer.noTransactionsDesc")}
            icon={<Scale className="h-6 w-6" />}
          />
        ) : (
          <TransactionHistory transactions={transactions} />
        )}
      </section>

      {/* Delete customer — destructive action with two-step confirmation */}
      <div className="pt-2">
        <DeleteButton
          loading={deleteCustomer.isPending}
          errorMessage={deleteError}
          onConfirm={() => {
            setDeleteError(null);
            deleteCustomer.mutate(customerId, {
              onSuccess: () => {
                router.push("/khata");
              },
              onError: (err) => {
                setDeleteError(err instanceof Error ? err.message : "Failed to delete customer.");
              },
            });
          }}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "red" | "green" | "slate";
}) {
  const toneClasses = {
    red: "text-red-700 bg-red-50",
    green: "text-brand-700 bg-brand-50",
    slate: "text-slate-700 bg-slate-100",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-center gap-1">
        <span className={cn("rounded p-0.5", toneClasses)}>{icon}</span>
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
        <Money value={value} />
      </p>
    </div>
  );
}

function TransactionHistory({ transactions }: { transactions: CustomerTransaction[] }) {
  // Reverse so newest is at the top — but keep running balance from oldest.
  // Each transaction already has its runningBalance computed chronologically,
  // so we just display in reverse for "newest first" UX.
  const reversed = [...transactions].reverse();

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {reversed.map((tx, idx) => (
        <TransactionRow key={tx.id} tx={tx} isFirst={idx === 0} />
      ))}
    </div>
  );
}

function TransactionRow({
  tx,
  isFirst,
}: {
  tx: CustomerTransaction;
  isFirst: boolean;
}) {
  const config = TX_TYPE_CONFIG[tx.type];
  const Icon = config.icon;

  const isDebit = tx.direction === "debit";
  const amountColor = isDebit ? "text-red-600" : "text-brand-700";
  const amountSign = isDebit ? "+" : "−";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        !isFirst && "border-t border-slate-100",
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.iconBg)}>
        <Icon className={cn("h-4 w-4", config.iconColor)} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-slate-900">
            {tx.description}
          </p>
          <p className={cn("text-sm font-bold tabular-nums", amountColor)}>
            {amountSign}
            <Money value={tx.amount} />
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400">
            {formatDate(new Date(tx.date))} · {formatTime(new Date(tx.date))}
          </p>
          <p className="text-[11px] font-medium text-slate-500">
            Balance: <span className="tabular-nums">
              <Money value={tx.runningBalance} />
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

const TX_TYPE_CONFIG = {
  sale: {
    icon: ShoppingCart,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
  },
  payment: {
    icon: Wallet,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-700",
  },
  adjustment: {
    icon: Scale,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
  },
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Skeleton
// ────────────────────────────────────────────────────────────────────────────

function CustomerDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-200" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                i > 0 && "border-t border-slate-100",
              )}
            >
              <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
