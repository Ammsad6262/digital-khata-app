/**
 * Expense detail page (/more/expenses/[id]).
 *
 * Shows:
 *   - Amount hero (red — money out)
 *   - Status badge (Recorded / Voided)
 *   - Name + category + date + notes
 *   - Edit button → /more/expenses/[id]/edit
 *   - Void action (with confirmation)
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ExpenseDetail as ExpenseDetailComponent } from "@/components/expenses/ExpenseDetail";

export const dynamic = "force-dynamic";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <AppHeader title="Expense Detail" />
      <ScreenContent>
        <ExpenseDetailComponent expenseId={id} />
      </ScreenContent>
    </>
  );
}
