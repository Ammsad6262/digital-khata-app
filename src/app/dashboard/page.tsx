"use client";

/**
 * Dashboard page — the home screen of the app.
 * Has a premium header with icon + title + subtitle + global More button on the right.
 * The floating QuickAdd FAB is shown on this page.
 *
 * V13: Header title and subtitle use t().
 */

import { ScreenContent } from "@/components/layout/Screen";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { MoreButton } from "@/components/layout/MoreButton";
import { useLanguage } from "@/providers/language-provider";

export default function DashboardPage() {
  const { t } = useLanguage();
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line/80 bg-surface/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/icon.png"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 shrink-0 rounded-[0.85rem] object-cover shadow-soft ring-1 ring-line"
          />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink">{t("app.name")}</h1>
            <p className="truncate text-[11px] text-ink-subtle">{t("dashboard.subtitle")}</p>
          </div>
        </div>
        <MoreButton />
      </header>
      <ScreenContent>
        <Dashboard />
      </ScreenContent>
    </>
  );
}
