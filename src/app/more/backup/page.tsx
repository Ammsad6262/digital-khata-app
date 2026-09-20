/**
 * Backup page.
 *
 * Lazy-loads the BackupPage component to keep the initial bundle small.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

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
