"use client";

/**
 * Recent transactions feed — scannable list of the latest money movements.
 *
 * Color-coded by transaction type so the owner can scan for "did the big
 * payment come in?" or "what did I sell today?" at a glance.
 *
 * Each row shows:
 *   - icon + type label (tone-coded)
 *   - customer or product name (context)
 *   - amount (direction shown with sign + colour)
 *   - relative time (e.g. "5 min ago")
 */

import Link from "next/link";
import {
  ShoppingCart,
  Wallet,
  Receipt,
  Package,
  Scale,
  Truck,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { Money } from "@/components/shared/Money";
import { formatRelative } from "@/lib/utils/date";
import type { RecentTransaction } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

type TxTypeInfo = {
  labelKey:
    | "transactions.sales"
    | "transactions.payments"
    | "transactions.expenses"
    | "transactions.stock"
    | "transactions.supplierPayments"
    | "transactions.adjustments";
  icon: typeof ShoppingCart;
  chip: string;
};

const TX_TYPE_INFO: Record<RecentTransaction["type"], TxTypeInfo> = {
  sale: {
    labelKey: "transactions.sales",
    icon: ShoppingCart,
    chip: "bg-brand-50 text-brand-700",
  },
  payment: {
    labelKey: "transactions.payments",
    icon: Wallet,
    chip: "bg-success-soft text-success-ink",
  },
  expense: {
    labelKey: "transactions.expenses",
    icon: Receipt,
    chip: "bg-warning-soft text-warning-ink",
  },
  stock_move: {
    labelKey: "transactions.stock",
    icon: Package,
    chip: "bg-info-soft text-info-ink",
  },
  supplier_payment: {
    labelKey: "transactions.supplierPayments",
    icon: Truck,
    chip: "bg-accent-50 text-accent-700",
  },
  balance_adjustment: {
    labelKey: "transactions.adjustments",
    icon: Scale,
    chip: "bg-surface-2 text-ink-muted",
  },
};

function getContext(tx: RecentTransaction): string | null {
  if (tx.customerName) return tx.customerName;
  if (tx.productName) return tx.productName;
  if (tx.notes) return tx.notes;
  return null;
}

function getAmountDisplay(tx: RecentTransaction): {
  sign: "" | "+" | "-";
  color: string;
  icon: typeof ArrowUpRight;
} {
  // For the owner's perspective:
  // - Payment: money received → positive (success)
  // - Expense: money spent → negative (danger)
  // - Sale: revenue → neutral ink
  if (tx.type === "payment") {
    return { sign: "+", color: "text-success-ink", icon: ArrowDownLeft };
  }
  if (tx.type === "expense") {
    return { sign: "-", color: "text-danger-ink", icon: ArrowUpRight };
  }
  if (tx.type === "sale") {
    return { sign: "", color: "text-ink", icon: ShoppingCart };
  }
  return { sign: "", color: "text-ink-muted", icon: ArrowDownLeft };
}

export function RecentTransactions({
  transactions,
}: {
  transactions: RecentTransaction[];
}) {
  const { t } = useLanguage();
  if (transactions.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="section-title">{t("dashboard.recentActivity")}</h2>
        <Link
          href="/more/transactions"
          className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          {t("dashboard.viewAll")}
        </Link>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card shadow-card">
        {transactions.map((tx, idx) => {
          const info = TX_TYPE_INFO[tx.type];
          const Icon = info.icon;
          const amountInfo = getAmountDisplay(tx);
          const context = getContext(tx);

          return (
            <div
              key={tx.id}
              className={cn(
                "flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface-2/60",
                idx > 0 && "border-t border-line",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem]",
                  info.chip,
                )}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {t(info.labelKey)}
                  </p>
                  <p
                    className={cn(
                      "shrink-0 text-[13px] font-bold tabular-nums",
                      amountInfo.color,
                    )}
                  >
                    <span className="mr-0.5 text-[11px] font-semibold opacity-70">
                      {amountInfo.sign}
                    </span>
                    <Money value={tx.amount} />
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] text-ink-subtle">
                    {context ?? "—"}
                  </p>
                  <p
                    className="shrink-0 text-[10px] font-medium text-ink-faint"
                    suppressHydrationWarning
                  >
                    {formatRelative(new Date(tx.date))}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}