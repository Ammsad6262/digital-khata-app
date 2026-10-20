"use client";

/**
 * RemindersCard — dashboard strip that surfaces overdue + due-today reminders.
 * Renders nothing when there is nothing due, so it never adds noise.
 */

import Link from "next/link";
import { AlertTriangle, Bell, ChevronRight } from "lucide-react";
import { useReminders } from "@/hooks/use-reminders";
import { useLanguage } from "@/providers/language-provider";

export function RemindersCard() {
  const { t } = useLanguage();
  const { data, isLoading } = useReminders("today");
  const counts = data?.counts;

  if (isLoading || !counts) return null;

  const total = counts.overdue + counts.today;
  if (total === 0) return null;

  const hasOverdue = counts.overdue > 0;

  return (
    <Link
      href="/more/reminders"
      className={`flex items-center gap-3 rounded-xl border p-3.5 ${
        hasOverdue
          ? "border-red-200 bg-red-50 hover:bg-red-100"
          : "border-amber-200 bg-amber-50 hover:bg-amber-100"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          hasOverdue ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
        }`}
      >
        {hasOverdue ? <AlertTriangle className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold ${
            hasOverdue ? "text-red-800" : "text-amber-800"
          }`}
        >
          {t("reminders.title")}
        </p>
        <p className={`text-xs ${hasOverdue ? "text-red-700" : "text-amber-700"}`}>
          {counts.overdue > 0 ? `${counts.overdue} ${t("reminders.overdue")}` : null}
          {counts.overdue > 0 && counts.today > 0 ? " · " : null}
          {counts.today > 0 ? `${counts.today} ${t("reminders.today")}` : null}
        </p>
      </div>

      <ChevronRight className={hasOverdue ? "h-4 w-4 text-red-500" : "h-4 w-4 text-amber-600"} />
    </Link>
  );
}
