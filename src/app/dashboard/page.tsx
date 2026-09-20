/**
 * Dashboard page — the home screen of the app.
 *
 * Mobile-first layout. The dashboard itself is a client component because:
 *   - It uses React Query for live data (with background refetch every 60s)
 *   - It shows loading skeletons / error retry UI that needs client state
 *
 * The header is a server component so it renders immediately.
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
