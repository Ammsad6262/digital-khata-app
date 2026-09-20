"use client";

/**
 * Bottom navigation — fixed at the bottom of every screen.
 *
 * 5 tabs per the V1 architecture:
 *   Dashboard | Khata | Sales | Stock | More
 *
 * Highlights the active tab based on the current pathname.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, ShoppingCart, Package, Menu } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/khata", label: "Khata", icon: BookOpen },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/more", label: "More", icon: Menu },
] as const;

export function BottomNav() {
  const pathname = usePathname();

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
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/dashboard" && pathname.startsWith(tab.href));

        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              isActive
                ? "text-brand-600"
                : "text-slate-500 hover:text-slate-900",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
