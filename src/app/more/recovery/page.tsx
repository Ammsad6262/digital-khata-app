"use client";

/**
 * Payment Recovery page (/more/recovery).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { RecoveryView } from "@/components/recovery/RecoveryView";
import { useLanguage } from "@/providers/language-provider";

export default function RecoveryPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("recovery.title")} />
      <ScreenContent>
        <RecoveryView />
      </ScreenContent>
    </>
  );
}
