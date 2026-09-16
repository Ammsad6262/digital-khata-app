/**
 * Khata page — placeholder.
 *
 * Will list customers who owe money, sorted by balance desc.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

export default function KhataPage() {
  return (
    <>
      <AppHeader title="Khata" />
      <ScreenContent>
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Customer khata list — coming in Phase 4.
        </p>
      </ScreenContent>
    </>
  );
}
