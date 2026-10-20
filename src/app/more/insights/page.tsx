"use client";

/**
 * Business insights page (/more/insights).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { InsightsView } from "@/components/insights/InsightsView";
import { useLanguage } from "@/providers/language-provider";

export default function InsightsPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("insights.title")} />
      <ScreenContent>
        <InsightsView />
      </ScreenContent>
    </>
  );
}
