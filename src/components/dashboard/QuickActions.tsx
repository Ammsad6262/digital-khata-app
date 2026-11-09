"use client";

/**
 * Quick actions — the four things an owner does most often.
 *
 * Deliberately asymmetric: the first action (New Sale) is the solid brand
 * tile, the rest sit quietly on the surface. That gives a clear primary
 * action instead of four competing colours.
 *
 *   - New Sale     → /sales/new        (primary, solid)
 *   - Add Payment  → /payments/new
 *   - Add Customer → /more/customers/new
 *   - Add Expense  → /more/expenses/new
 */

import Link from "next/link";
import { ShoppingCart, Wallet, UserPlus, Receipt } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

const ACTIONS = [
  {
    href: "/sales/new",
    labelKey: "action.newSale",
    icon: ShoppingCart,
    solid: true,
    chip: "bg-surface/15 text-white",
  },
  {
    href: "/payments/new",
    labelKey: "action.addPayment",
    icon: Wallet,
    solid: false,
    chip: "bg-info-soft text-info-ink",
  },
  {
    href: "/more/customers/new",
    labelKey: "action.addCustomer",
    icon: UserPlus,
    solid: false,
    chip: "bg-brand-50 text-brand-700",
  },
  {
    href: "/more/expenses/new",
    labelKey: "action.addExpense",
    icon: Receipt,
    solid: false,
    chip: "bg-warning-soft text-warning-ink",
  },
] as const;

export function QuickActions() {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className={cn(
              "flex items-center gap-2.5 rounded-card p-3 transition-all duration-150 active:scale-[0.98]",
              action.solid
                ? "bg-brand-600 text-white shadow-brand hover:bg-brand-700"
                : "border border-line bg-surface text-ink shadow-card hover:bg-surface-2",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem]",
                action.chip,
              )}
            >
              <Icon className="h-[1.05rem] w-[1.05rem]" />
            </span>
            <span className="truncate text-[13px] font-semibold tracking-[-0.01em]">
              {t(action.labelKey)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}