/**
 * Settings page (/more/settings).
 *
 * Full settings: business info, currency, theme, security (PIN),
 * data management (danger zone), backup & export link.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SettingsPage } from "@/components/settings/SettingsPage";


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
