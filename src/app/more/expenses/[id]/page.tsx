/**
 * Expense detail page (/more/expenses/[id]).
 *
 * Shows:
 *   - Amount hero (red — money out)
 *   - Status badge (Recorded / Voided)
 *   - Name + category + date + notes
 *   - Edit button → /more/expenses/[id]/edit
 *   - Void action (with confirmation)
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ExpenseDetail as ExpenseDetailComponent } from "@/components/expenses/ExpenseDetail";

export const dynamic = "force-dynamic";

export default function ExpenseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <AppHeader title="Expense Detail" />
      <ScreenContent>
        <ExpenseDetailComponent expenseId={params.id} />
      </ScreenContent>
    </>
  );
}
