/**
 * Settings page.
 *
 * Lazy-loads the SettingsPage component (which includes currency picker,
 * theme picker, PIN forms, backup section) to keep the initial bundle small.
 * V13: Uses TranslatedHeader so the title is translated to user's language.
 */

import dynamic from "next/dynamic";
import { ScreenContent } from "@/components/layout/Screen";
import { TranslatedHeader } from "@/components/layout/TranslatedHeader";

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
      <TranslatedHeader titleKey="settings.title" backHref="/dashboard" />
      <ScreenContent>
        <SettingsPage />
      </ScreenContent>
    </>
  );
}
