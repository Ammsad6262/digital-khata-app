"use client";

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
import { useLanguage } from "@/providers/language-provider";

type SectionKey =
  | "more.addCustomer"
  | "more.products"
  | "more.expenses"
  | "more.transactions"
  | "more.settings";

type Section = {
  href: string;
  titleKey: SectionKey;
  descKey: string;
  icon: typeof Users;
  color: string;
};

const SECTIONS: Section[] = [
  {
    href: "/more/customers/new",
    titleKey: "more.addCustomer",
    descKey: "more.addCustomerDesc",
    icon: Users,
    color: "bg-brand-50 text-brand-700",
  },
  {
    href: "/more/products",
    titleKey: "more.products",
    descKey: "more.productsDesc",
    icon: Package,
    color: "bg-blue-50 text-blue-700",
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
      <AppHeader title={t("nav.more")} />
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
                    {t(section.titleKey)}
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
