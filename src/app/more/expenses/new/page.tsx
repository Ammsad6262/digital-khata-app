"use client";

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
import { useLanguage } from "@/providers/language-provider";


export default function NewExpensePage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("action.addExpense")}
        rightSlot={
          <Link
            href="/more/expenses"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("common.back")}
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
