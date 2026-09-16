/**
 * Stock page — placeholder.
 *
 * Will list products with current stock, highlight low stock, allow adjustments.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

export default function StockPage() {
  return (
    <>
      <AppHeader title="Stock" />
      <ScreenContent>
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Stock overview — coming in Phase 4.
        </p>
      </ScreenContent>
    </>
  );
}
