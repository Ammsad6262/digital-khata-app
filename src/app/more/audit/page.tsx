"use client";

/**
 * Audit trail page (/more/audit).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { AuditView } from "@/components/audit/AuditView";
import { useLanguage } from "@/providers/language-provider";

export default function AuditPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("audit.title")} />
      <ScreenContent>
        <AuditView />
      </ScreenContent>
    </>
  );
}
