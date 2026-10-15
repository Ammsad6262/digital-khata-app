/**
 * Backup page.
 *
 * Lazy-loads the BackupPage component to keep the initial bundle small.
 * V13: Uses TranslatedHeader so the title is translated to user's language.
 */

import dynamic from "next/dynamic";
import { ScreenContent } from "@/components/layout/Screen";
import { TranslatedHeader } from "@/components/layout/TranslatedHeader";

const BackupPage = dynamic(
  () => import("@/components/backup/BackupPage").then((m) => m.BackupPage),
  {
    loading: () => (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
      </div>
    ),
  },
);

export default function BackupRoutePage() {
  return (
    <>
      <TranslatedHeader titleKey="settings.backupExport" backHref="/more/settings" />
      <ScreenContent>
        <BackupPage />
      </ScreenContent>
    </>
  );
}
