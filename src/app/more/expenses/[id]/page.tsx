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
 * V13: Page is a server component but uses a client wrapper for the
 *      translated title. The TranslationBoundary below reads the language
 *      from localStorage on the client and renders the translated title.
 */

import { ScreenContent } from "@/components/layout/Screen";
import { ExpenseDetail as ExpenseDetailComponent } from "@/components/expenses/ExpenseDetail";
import { TranslatedHeader } from "@/components/layout/TranslatedHeader";

export const dynamic = "force-dynamic";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <TranslatedHeader titleKey="expense.expenseDetail" />
      <ScreenContent>
        <ExpenseDetailComponent expenseId={id} />
      </ScreenContent>
    </>
  );
}
