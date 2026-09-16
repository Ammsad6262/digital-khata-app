/**
 * Backup page (/more/backup).
 *
 * Full backup/export/import UI.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { BackupPage } from "@/components/backup/BackupPage";

export const dynamic = "force-dynamic";

export default function BackupRoutePage() {
  return (
    <>
      <AppHeader
        title="Backup & Export"
        rightSlot={
          <Link
            href="/more/settings"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <BackupPage />
      </ScreenContent>
    </>
  );
}
