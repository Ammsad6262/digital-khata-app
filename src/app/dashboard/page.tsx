/**
 * Dashboard page — the home screen of the app.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function DashboardPage() {
  return (
    <>
      <AppHeader title="Digital Khata" />
      <ScreenContent>
        <Dashboard />
      </ScreenContent>
    </>
  );
}
