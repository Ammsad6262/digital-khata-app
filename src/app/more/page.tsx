"use client";

/**
 * More page — index of secondary sections.
 *
 * Links to: Customers (khata), Payments, Products, Expenses, Transactions, Settings.
 */

import Link from "next/link";
import {
  Users,
  Package,
  Receipt,
  ListTree,
  Settings,
  ChevronRight,
  Wallet,
  Database,
  Crown,
  Menu,
} from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { useLanguage } from "@/providers/language-provider";

type Section = {
  href: string;
  titleKey: string;
  descKey: string;
  icon: typeof Users;
  color: string;
};

const SECTIONS: Section[] = [
  {
    href: "/more/subscription",
    titleKey: "subscription.title",
    descKey: "subscription.subtitle",
    icon: Crown,
    color: "bg-amber-50 text-amber-700",
  },
  {
    href: "/khata",
    titleKey: "nav.khata",
    descKey: "more.customersDesc",
    icon: Users,
    color: "bg-brand-50 text-brand-700",
  },
  {
    href: "/payments",
    titleKey: "more.payments",
    descKey: "more.paymentsDesc",
    icon: Wallet,
    color: "bg-blue-50 text-blue-700",
  },
  {
    href: "/more/products",
    titleKey: "more.products",
    descKey: "more.productsDesc",
    icon: Package,
    color: "bg-indigo-50 text-indigo-700",
  },
  {
    href: "/more/expenses",
    titleKey: "more.expenses",
    descKey: "more.expensesDesc",
    icon: Receipt,
    color: "bg-amber-50 text-amber-700",
  },
  {
    href: "/more/transactions",
    titleKey: "more.transactions",
    descKey: "more.transactionsDesc",
    icon: ListTree,
    color: "bg-purple-50 text-purple-700",
  },
  {
    href: "/more/backup",
    titleKey: "more.backup",
    descKey: "more.backupDesc",
    icon: Database,
    color: "bg-slate-100 text-slate-700",
  },
  {
    href: "/more/settings",
    titleKey: "more.settings",
    descKey: "more.settingsDesc",
    icon: Settings,
    color: "bg-slate-100 text-slate-700",
  },
];

export default function MorePage() {
  const { t } = useLanguage();
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Menu className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-slate-900">{t("nav.more")}</h1>
          <p className="truncate text-xs text-slate-500">All sections & settings</p>
        </div>
      </header>
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
                    {t(section.titleKey as any)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {t(section.descKey as any)}
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
