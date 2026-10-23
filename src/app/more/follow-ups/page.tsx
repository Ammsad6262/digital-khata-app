"use client";

/**
 * Follow-ups page (/more/follow-ups).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { FollowUpsView } from "@/components/followups/FollowUpsView";
import { useLanguage } from "@/providers/language-provider";

export default function FollowUpsPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("followUps.title")} />
      <ScreenContent>
        <FollowUpsView />
      </ScreenContent>
    </>
  );
}
