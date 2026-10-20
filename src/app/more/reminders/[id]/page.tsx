"use client";

/**
 * Edit reminder page (/more/reminders/[id]).
 */

import { use } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ReminderForm } from "@/components/reminders/ReminderForm";
import { useLanguage } from "@/providers/language-provider";

export default function EditReminderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("reminders.editReminder")} />
      <ScreenContent>
        <ReminderForm mode="edit" reminderId={id} />
      </ScreenContent>
    </>
  );
}
