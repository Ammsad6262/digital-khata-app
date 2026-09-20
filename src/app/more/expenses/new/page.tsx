/**
 * Add Expense page (/more/expenses/new).
 *
 * Server shell — the form is a client component.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";


export default function NewExpensePage() {
  return (
    <>
      <AppHeader
        title="Add Expense"
        rightSlot={
          <Link
            href="/more/expenses"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <ExpenseForm mode="create" />
      </ScreenContent>
    </>
  );
}
