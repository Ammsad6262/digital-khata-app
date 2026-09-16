/**
 * More page — index of secondary sections.
 *
 * Links to: Customers, Products, Expenses, Transactions, Settings.
 * Stock is in the bottom nav; Products here is the management UI
 * (vs. Stock overview which is the operational view).
 */

import Link from "next/link";
import {
  Users,
  Package,
  Receipt,
  ListTree,
  Settings,
  ChevronRight,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

const SECTIONS = [
  {
    href: "/more/customers/new",
    title: "Add Customer",
    description: "Add a new customer to the khata",
    icon: Users,
    color: "bg-brand-50 text-brand-700",
  },
  {
    href: "/more/products",
    title: "Products",
    description: "Manage your products, prices, and stock thresholds",
    icon: Package,
    color: "bg-blue-50 text-blue-700",
  },
  {
    href: "/more/expenses",
    title: "Expenses",
    description: "Record and track business expenses by category",
    icon: Receipt,
    color: "bg-amber-50 text-amber-700",
  },
  {
    href: "/more/transactions",
    title: "Transactions",
    description: "Full transaction history with date filters",
    icon: ListTree,
    color: "bg-purple-50 text-purple-700",
  },
  {
    href: "/more/settings",
    title: "Settings",
    description: "Business name, currency, backup, PIN",
    icon: Settings,
    color: "bg-slate-100 text-slate-700",
  },
] as const;

export default function MorePage() {
  return (
    <>
      <AppHeader title="More" />
      <ScreenContent>
        <div className="space-y-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 active:bg-slate-100"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${section.color}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {section.title}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {section.description}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            );
          })}
        </div>
      </ScreenContent>
    </>
  );
}
