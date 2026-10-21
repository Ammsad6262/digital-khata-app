"use client";

/**
 * Growth plan page (/more/growth).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { GrowthView } from "@/components/growth/GrowthView";
import { useLanguage } from "@/providers/language-provider";

export default function GrowthPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("growth.title")} />
      <ScreenContent>
        <GrowthView />
      </ScreenContent>
    </>
  );
}
