"use client";

/**
 * Bottom navigation — a floating "dock" pinned to the bottom of every screen.
 *
 * 5 tabs: Dashboard | Khata | Sales | Stock | Expenses
 * The active tab lifts into a solid brand pill so the current location is
 * obvious at a glance, even in bright sunlight.
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
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[540px] px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
      aria-label="Main navigation"
    >
      <div className="flex h-[4.15rem] items-stretch gap-1 rounded-[1.7rem] border border-line bg-surface/85 p-1.5 shadow-lift backdrop-blur-xl">
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
                "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[1.2rem] text-[10px] font-semibold leading-none transition-all duration-200",
                isActive
                  ? "bg-brand-600 text-white shadow-brand"
                  : "text-ink-subtle hover:bg-surface-2 hover:text-ink active:bg-surface-3",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-[1.15rem] w-[1.15rem] transition-transform duration-200",
                  isActive ? "scale-110" : "group-hover:scale-105",
                )}
                strokeWidth={isActive ? 2.4 : 2}
              />
              <span className="max-w-full truncate px-1">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}