"use client";

/**
 * Quick actions — 4 large tappable buttons for the dashboard.
 *
 * Each button navigates to its respective entry form:
 *   - New Sale     → /sales/new
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
    tone: "bg-brand-600 text-white hover:bg-brand-700",
  },
  {
    href: "/payments/new",
    labelKey: "action.addPayment",
    icon: Wallet,
    tone: "bg-blue-600 text-white hover:bg-blue-700",
  },
  {
    href: "/more/customers/new",
    labelKey: "action.addCustomer",
    icon: UserPlus,
    tone: "bg-slate-900 text-white hover:bg-slate-800",
  },
  {
    href: "/more/expenses/new",
    labelKey: "action.addExpense",
    icon: Receipt,
    tone: "bg-amber-500 text-white hover:bg-amber-600",
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
              "flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold shadow-sm transition-colors active:scale-[0.98]",
              action.tone,
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{t(action.labelKey)}</span>
          </Link>
        );
      })}
    </div>
  );
}
