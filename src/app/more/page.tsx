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
import { PageHeader } from "@/components/layout/PageHeader";
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
        color: "bg-info-soft text-info-ink",
      },
      {
        href: "/more/transactions",
        titleKey: "more.transactions",
        descKey: "more.transactionsDesc",
        icon: ListTree,
        color: "bg-accent-50 text-accent-700",
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
        color: "bg-surface-2 text-ink-muted",
      },
      {
        href: "/more/recovery",
        titleKey: "more.recovery",
        descKey: "more.recoveryDesc",
        icon: HandCoins,
        color: "bg-danger-soft text-danger-ink",
      },
      {
        href: "/more/audit",
        titleKey: "more.audit",
        descKey: "more.auditDesc",
        icon: History,
        color: "bg-surface-2 text-ink-muted",
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
        color: "bg-warning-soft text-warning-ink",
      },
      {
        href: "/more/redeem",
        titleKey: "more.redeem",
        descKey: "more.redeemDesc",
        icon: Gift,
        color: "bg-success-soft text-success-ink",
      },
      {
        href: "/more/settings",
        titleKey: "more.settings",
        descKey: "more.settingsDesc",
        icon: SettingsIcon,
        color: "bg-surface-2 text-ink-muted",
      },
    ],
  },
];

export default function MorePage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        icon={Menu}
        tone="neutral"
        showMore={false}
        showRefresh={false}
        title={t("nav.more")}
        subtitle={t("nav.moreDesc")}
      />
      <ScreenContent>
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <section key={group.titleKey}>
              <p className="eyebrow mb-1.5 px-1">
                {t(group.titleKey as never)}
              </p>
              <div className="space-y-2">
                {group.items.map((section) => {
                  const Icon = section.icon;
                  return (
                    <Link
                      key={section.href}
                      href={section.href}
                      className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card transition-colors hover:bg-app active:bg-surface-2"
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] ${section.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-ink">
                          {t(section.titleKey as never)}
                        </p>
                        <p className="text-[11px] text-ink-subtle">
                          {t(section.descKey as never)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint rtl-flip" />
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
