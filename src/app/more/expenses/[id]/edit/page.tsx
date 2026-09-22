/**
 * Edit Expense page.
 *
 * Server shell — the form is a client component.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
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
      <AppHeader
        title="Edit Expense"
        rightSlot={
          <Link
            href={`/more/expenses/${id}`}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <ExpenseForm mode="edit" expenseId={id} />
      </ScreenContent>
    </>
  );
}
