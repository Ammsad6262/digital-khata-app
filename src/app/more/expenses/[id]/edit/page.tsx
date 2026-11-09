/**
 * Edit Expense page.
 *
 * Server shell — the form is a client component.
 * V13: Uses TranslatedHeader so the title is translated to user's language.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { ScreenContent } from "@/components/layout/Screen";
import { TranslatedHeader } from "@/components/layout/TranslatedHeader";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";

export const dynamic = "force-dynamic";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <TranslatedHeader titleKey="expense.updateExpense" backHref={`/more/expenses/${id}`} />
      <ScreenContent>
        <ExpenseForm mode="edit" expenseId={id} />
      </ScreenContent>
    </>
  );
}
