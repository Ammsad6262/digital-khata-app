/**
 * Dashboard page — the home screen of the app.
 *
 * Uses next/dynamic to lazy-load the Dashboard client component, reducing
 * the initial JS bundle. The skeleton shows immediately (from the static
 * HTML) while the Dashboard component chunk loads on demand.
 */

import dynamic from "next/dynamic";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

const Dashboard = dynamic(
  () => import("@/components/dashboard/Dashboard").then((m) => m.Dashboard),
  {
    loading: () => (
      <div className="space-y-4">
        <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>
    ),
    ssr: true, // Keep SSR so the initial HTML renders (good for CLS)
  },
);

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
