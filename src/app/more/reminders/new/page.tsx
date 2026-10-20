"use client";

/**
 * New reminder page (/more/reminders/new).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ReminderForm } from "@/components/reminders/ReminderForm";
import { useLanguage } from "@/providers/language-provider";

export default function NewReminderPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("reminders.newReminder")} />
      <ScreenContent>
        <ReminderForm mode="create" />
      </ScreenContent>
    </>
  );
}
