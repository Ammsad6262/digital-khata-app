"use client";

/**
 * Dashboard page — the home screen of the app.
 * Has a premium header with icon + title + subtitle.
 * The floating QuickAdd FAB is shown on this page.
 */

import { LayoutDashboard } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function DashboardPage() {
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-slate-900">Digital Khata</h1>
          <p className="truncate text-xs text-slate-500">Your business at a glance</p>
        </div>
      </header>
      <ScreenContent>
        <Dashboard />
      </ScreenContent>
    </>
  );
}
