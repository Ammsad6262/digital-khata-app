/**
 * Sales page — placeholder.
 *
 * Will list recent sales + provide a "New Sale" entry point.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

export default function SalesPage() {
  return (
    <>
      <AppHeader title="Sales" />
      <ScreenContent>
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Sales list and entry — coming in Phase 4.
        </p>
      </ScreenContent>
    </>
  );
}
