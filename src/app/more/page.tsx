/**
 * More page — placeholder.
 *
 * Will link to: Customers, Products, Expenses, Transactions, Settings.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

export default function MorePage() {
  return (
    <>
      <AppHeader title="More" />
      <ScreenContent>
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          More menu — coming in Phase 4.
        </p>
      </ScreenContent>
    </>
  );
}
