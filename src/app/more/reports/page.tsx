"use client";

/**
 * Reports page (/more/reports).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ReportsView } from "@/components/reports/ReportsView";
import { useLanguage } from "@/providers/language-provider";

export default function ReportsPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("reports.title")} />
      <ScreenContent>
        <ReportsView />
      </ScreenContent>
    </>
  );
}
