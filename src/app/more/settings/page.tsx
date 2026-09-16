/**
 * Settings page — placeholder (will be built in a later phase).
 *
 * Will contain: business name, currency, backup/restore, PIN.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { EmptyState } from "@/components/shared/EmptyState";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <>
      <AppHeader title="Settings" />
      <ScreenContent>
        <EmptyState
          title="Settings coming soon"
          description="Business name, currency, backup/restore, and PIN lock will be built in a later phase."
          icon={<Settings className="h-6 w-6" />}
        />
      </ScreenContent>
    </>
  );
}
