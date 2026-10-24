"use client";

/**
 * /more page — V2: this is now a SECONDARY entry point. The PRIMARY More
 * entry is the MoreButton in every main page header (opens MoreDrawer).
 *
 * This page still exists so direct navigation (e.g. links from older
 * notifications, bookmarks, the bottom nav before V2) still works. It
 * renders the same list of secondary sections as the drawer, but as a
 * full-page list instead of a slide-out panel.
 *
 * V2 changes:
 *   - Removed Khata (it's a bottom nav tab)
 *   - Removed Products (accessible via Stock → Add → Add Product)
 *   - Removed Expenses (it's a bottom nav tab now)
 *   - Added a MoreButton at the top-right for consistency with other pages.
 */

import Link from "next/link";
import {
  Wallet,
  ListTree,
  Settings as SettingsIcon,
  ChevronRight,
  Database,
  Crown,
  Gift,
  Menu,
  HandCoins,
  History,
} from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { MoreButton } from "@/components/layout/MoreButton";
import { useLanguage } from "@/providers/language-provider";

type Section = {
  href: string;
  titleKey: string;
  descKey: string;
  icon: typeof Wallet;
  color: string;
};

type SectionGroup = {
  titleKey: string;
  items: Section[];
};

// V2 — Khata, Products, and Expenses removed (they have their own primary
// navigation now via the bottom nav). The remaining items are grouped by
// purpose, matching the MoreDrawer groups.
const GROUPS: SectionGroup[] = [
  {
    titleKey: "more.groupManagement",
    items: [
      {
        href: "/payments",
        titleKey: "more.payments",
        descKey: "more.paymentsDesc",
        icon: Wallet,
        color: "bg-blue-50 text-blue-700",
      },
      {
        href: "/more/transactions",
        titleKey: "more.transactions",
        descKey: "more.transactionsDesc",
        icon: ListTree,
        color: "bg-purple-50 text-purple-700",
      },
    ],
  },
  {
    titleKey: "more.groupTools",
    items: [
      {
        href: "/more/backup",
        titleKey: "more.backup",
        descKey: "more.backupDesc",
        icon: Database,
        color: "bg-slate-100 text-slate-700",
      },
      {
        href: "/more/recovery",
        titleKey: "more.recovery",
        descKey: "more.recoveryDesc",
        icon: HandCoins,
        color: "bg-rose-50 text-rose-700",
      },
      {
        href: "/more/audit",
        titleKey: "more.audit",
        descKey: "more.auditDesc",
        icon: History,
        color: "bg-slate-100 text-slate-700",
      },
    ],
  },
  {
    titleKey: "more.groupSettings",
    items: [
      {
        href: "/more/subscription",
        titleKey: "subscription.title",
        descKey: "subscription.subtitle",
        icon: Crown,
        color: "bg-amber-50 text-amber-700",
      },
      {
        href: "/more/redeem",
        titleKey: "more.redeem",
        descKey: "more.redeemDesc",
        icon: Gift,
        color: "bg-emerald-50 text-emerald-700",
      },
      {
        href: "/more/settings",
        titleKey: "more.settings",
        descKey: "more.settingsDesc",
        icon: SettingsIcon,
        color: "bg-slate-100 text-slate-700",
      },
    ],
  },
];

export default function MorePage() {
  const { t } = useLanguage();
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Menu className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">{t("nav.more")}</h1>
            <p className="truncate text-xs text-slate-500">{t("nav.moreDesc")}</p>
          </div>
        </div>
        <MoreButton />
      </header>
      <ScreenContent>
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <section key={group.titleKey}>
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {t(group.titleKey as never)}
              </p>
              <div className="space-y-2">
                {group.items.map((section) => {
                  const Icon = section.icon;
                  return (
                    <Link
                      key={section.href}
                      href={section.href}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 active:bg-slate-100"
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${section.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {t(section.titleKey as never)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {t(section.descKey as never)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </ScreenContent>
    </>
  );
}
