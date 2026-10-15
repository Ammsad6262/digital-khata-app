"use client";

/**
 * Bottom navigation — fixed at the bottom of every screen.
 *
 * 5 tabs (V2 — Expenses replaces More in the bottom nav; More moves to the
 * top-right of every page header as a slide-out drawer trigger):
 *   Dashboard | Khata | Sales | Stock | Expenses
 *
 * Highlights the active tab based on the current pathname.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, ShoppingCart, Package, Receipt } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

const TABS = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/khata", labelKey: "nav.khata", icon: BookOpen },
  { href: "/sales", labelKey: "nav.sales", icon: ShoppingCart },
  { href: "/stock", labelKey: "nav.stock", icon: Package },
  { href: "/expenses", labelKey: "nav.expenses", icon: Receipt },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-16 w-full items-stretch border-t border-slate-200 bg-white"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        maxWidth: "1024px",
      }}
      aria-label="Main navigation"
    >
      {TABS.map((tab) => {
        // /expenses should also be active when the user is on /expenses/new,
        // /expenses/[id], /more/expenses/* (legacy expense routes still
        // redirect to the new /expenses view).
        const isExpensesActive =
          tab.href === "/expenses" &&
          (pathname === "/expenses" ||
            pathname.startsWith("/expenses/") ||
            pathname.startsWith("/more/expenses"));

        const isActive =
          isExpensesActive ||
          pathname === tab.href ||
          (tab.href !== "/dashboard" && pathname.startsWith(tab.href));

        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              isActive
                ? "text-brand-600"
                : "text-slate-500 hover:text-slate-900",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-5 w-5" />
            <span>{t(tab.labelKey)}</span>
            {/* Active tab underline indicator */}
            {isActive ? (
              <span className="absolute bottom-1 h-0.5 w-8 rounded-full bg-brand-600" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
