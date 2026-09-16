"use client";

/**
 * Recent transactions feed — scannable list of the latest money movements.
 *
 * Color-coded by transaction type so the owner can scan for "did the big
 * payment come in?" or "what did I sell today?" at a glance.
 *
 * Each row shows:
 *   - icon + type label (color-coded)
 *   - customer or product name (context)
 *   - amount (positive/negative direction shown with color)
 *   - relative time (e.g. "5 min ago")
 */

import Link from "next/link";
import {
  ShoppingCart,
  Wallet,
  Receipt,
  Package,
  Scale,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { Money } from "@/components/shared/Money";
import { formatRelative, formatTime } from "@/lib/utils/date";
import type { RecentTransaction } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils/cn";

type TxTypeInfo = {
  label: string;
  icon: typeof ShoppingCart;
  iconBg: string;
  iconColor: string;
};

const TX_TYPE_INFO: Record<RecentTransaction["type"], TxTypeInfo> = {
  sale: {
    label: "Sale",
    icon: ShoppingCart,
    iconBg: "bg-brand-100",
    iconColor: "text-brand-700",
  },
  payment: {
    label: "Payment",
    icon: Wallet,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
  },
  expense: {
    label: "Expense",
    icon: Receipt,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
  },
  stock_move: {
    label: "Stock",
    icon: Package,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-700",
  },
  balance_adjustment: {
    label: "Adjustment",
    icon: Scale,
    iconBg: "bg-slate-200",
    iconColor: "text-slate-700",
  },
};

function getContext(tx: RecentTransaction): string | null {
  if (tx.customerName) return tx.customerName;
  if (tx.productName) return tx.productName;
  if (tx.notes) return tx.notes;
  return null;
}

function getAmountDisplay(tx: RecentTransaction): {
  text: string;
  color: string;
  icon: typeof ArrowUpRight;
} {
  // For the owner's perspective:
  // - Sale: customer owes more → red (negative for owner's cash) — actually positive for business
  //   but shown as "+" because it's a sale. We use direction-based coloring.
  // - Payment: money received → green (+)
  // - Expense: money spent → red (-)
  // - Stock move: no direct cash impact, show neutral
  // - Adjustment: depends on direction

  if (tx.type === "payment") {
    return {
      text: `+${tx.amount}`,
      color: "text-brand-700",
      icon: ArrowDownLeft,
    };
  }
  if (tx.type === "expense") {
    return {
      text: `-${tx.amount}`,
      color: "text-red-600",
      icon: ArrowUpRight,
    };
  }
  if (tx.type === "sale") {
    return {
      text: tx.amount,
      color: "text-slate-900",
      icon: ShoppingCart,
    };
  }
  // Stock move / adjustment — no money direction, just show the amount.
  return {
    text: tx.amount,
    color: "text-slate-700",
    icon: ArrowDownLeft,
  };
}

export function RecentTransactions({
  transactions,
}: {
  transactions: RecentTransaction[];
}) {
  if (transactions.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-slate-700">Recent Activity</h2>
        <Link
          href="/more/transactions"
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          View all
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {transactions.map((tx, idx) => {
          const info = TX_TYPE_INFO[tx.type];
          const Icon = info.icon;
          const amountInfo = getAmountDisplay(tx);
          const AmountIcon = amountInfo.icon;
          const context = getContext(tx);

          return (
            <div
              key={tx.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                idx > 0 && "border-t border-slate-100",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  info.iconBg,
                )}
              >
                <Icon className={cn("h-4 w-4", info.iconColor)} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {info.label}
                  </p>
                  <p className={cn("text-sm font-bold tabular-nums", amountInfo.color)}>
                    <Money value={amountInfo.text.replace(/^[+-]/, "")} />
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-slate-500">
                    {context ?? "—"}
                  </p>
                  <p className="shrink-0 text-[11px] text-slate-400">
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
