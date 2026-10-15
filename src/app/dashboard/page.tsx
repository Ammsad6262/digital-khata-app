"use client";

/**
 * Dashboard page — the home screen of the app.
 * Has a premium header with icon + title + subtitle + global More button on the right.
 * The floating QuickAdd FAB is shown on this page.
 *
 * V13: Header title and subtitle use t().
 */

import { LayoutDashboard } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { MoreButton } from "@/components/layout/MoreButton";
import { useLanguage } from "@/providers/language-provider";

export default function DashboardPage() {
  const { t } = useLanguage();
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">{t("app.name")}</h1>
            <p className="truncate text-xs text-slate-500">{t("dashboard.subtitle")}</p>
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
