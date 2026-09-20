/**
 * Settings page.
 *
 * Lazy-loads the SettingsPage component (which includes currency picker,
 * theme picker, PIN forms, backup section) to keep the initial bundle small.
 */

import dynamic from "next/dynamic";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

const SettingsPage = dynamic(
  () => import("@/components/settings/SettingsPage").then((m) => m.SettingsPage),
  {
    loading: () => (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
    ),
  },
);

export default function SettingsRoutePage() {
  return (
    <>
      <AppHeader title="Settings" />
      <ScreenContent>
        <SettingsPage />
      </ScreenContent>
    </>
  );
}
