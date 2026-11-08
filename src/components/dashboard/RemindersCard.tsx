"use client";

/**
 * RemindersCard — dashboard strip that surfaces overdue + due-today reminders.
 * Renders nothing when there is nothing due, so it never adds noise.
 */

import Link from "next/link";
import { AlertTriangle, Bell, ChevronRight } from "lucide-react";
import { useReminders } from "@/hooks/use-reminders";
import { useLanguage } from "@/providers/language-provider";
import { cn } from "@/lib/utils/cn";

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
      className={cn(
        "flex items-center gap-3 rounded-card border p-3.5 shadow-card transition-colors",
        hasOverdue
          ? "border-danger/25 bg-danger-soft/60 hover:bg-danger-soft"
          : "border-warning/25 bg-warning-soft/60 hover:bg-warning-soft",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem]",
          hasOverdue
            ? "bg-danger/15 text-danger-ink"
            : "bg-warning/15 text-warning-ink",
        )}
      >
        {hasOverdue ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[13px] font-semibold",
            hasOverdue ? "text-danger-ink" : "text-warning-ink",
          )}
        >
          {t("reminders.title")}
        </p>
        <p
          className={cn(
            "text-[11px]",
            hasOverdue ? "text-danger-ink/80" : "text-warning-ink/80",
          )}
        >
          {counts.overdue > 0 ? `${counts.overdue} ${t("reminders.overdue")}` : null}
          {counts.overdue > 0 && counts.today > 0 ? " · " : null}
          {counts.today > 0 ? `${counts.today} ${t("reminders.today")}` : null}
        </p>
      </div>

      <ChevronRight
        className={cn(
          "h-4 w-4 rtl-flip",
          hasOverdue ? "text-danger" : "text-warning-ink",
        )}
      />
    </Link>
  );
}