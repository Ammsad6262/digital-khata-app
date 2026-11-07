"use client";

/**
 * Bottom navigation — fixed at the bottom of every screen.
 *
 * 5 tabs (V2 — Expenses replaces More in the bottom nav; More moves to the
 * top-right of every page header as a slide-out drawer trigger):
 *   Dashboard | Khata | Sales | Stock | Expenses
 *
 * Highlights the active tab based on the current pathname.
 *
 * Usability (Improvement 2): the active section is marked with THREE
 * reinforcing cues so it can be recognised without reading —
 *   1. a tinted pill behind the icon,
 *   2. a bold, brand-coloured label,
 *   3. a bottom indicator bar.
 * Each tab is also a full-height (64px), comfortably tappable target, and the
 * icons are slightly larger and drawn with a heavier stroke when active.
 *
 * Structure is unchanged: same 5 tabs, same order, same destinations.
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
      aria-label={t("nav.mainNavigation")}
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
              "group relative flex flex-1 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium",
              isActive
                ? "text-brand-700"
                : "text-slate-500 hover:text-slate-900",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {/* Icon inside a tinted pill when active — a strong, non-text
                "you are here" cue that pre-literate users can recognise. */}
            <span
              className={cn(
                "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                isActive
                  ? "bg-brand-100 text-brand-700"
                  : "text-slate-500 group-hover:bg-slate-100 group-hover:text-slate-900",
              )}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 2} />
            </span>
            <span className={cn(isActive && "font-semibold")}>{t(tab.labelKey)}</span>
            {/* Bottom indicator bar — a third, persistent cue. */}
            <span
              className={cn(
                "absolute bottom-0 h-[3px] w-10 rounded-full transition-opacity",
                isActive ? "bg-brand-600 opacity-100" : "opacity-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
