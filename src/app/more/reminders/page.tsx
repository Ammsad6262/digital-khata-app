"use client";

/**
 * Reminders page (/more/reminders).
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { RemindersList } from "@/components/reminders/RemindersList";
import { useLanguage } from "@/providers/language-provider";

export default function RemindersPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("reminders.title")}
        rightSlot={
          <Link
            href="/more/reminders/new"
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label={t("reminders.add")}
          >
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <RemindersList />
      </ScreenContent>
    </>
  );
}
