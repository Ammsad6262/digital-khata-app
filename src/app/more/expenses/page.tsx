/**
 * Expenses list page (/more/expenses).
 *
 * Shows recent expenses with date filter chips (Today / Week / Month / All).
 * Each row: name, date, amount (red — money out), category badge.
 * Tappable → /more/expenses/[id]
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ExpensesList } from "@/components/expenses/ExpensesList";


export default function ExpensesPage() {
  return (
    <>
      <AppHeader
        title="Expenses"
        rightSlot={
          <Link
            href="/more/expenses/new"
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label="Add expense"
          >
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <ExpensesList />
      </ScreenContent>
    </>
  );
}
