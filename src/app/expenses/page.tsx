"use client";

/**
 * /expenses — the main Expenses page (bottom-nav entry point).
 */

import { Receipt, Plus } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { PageHeader, HeaderAction } from "@/components/layout/PageHeader";
import { ExpensesOverview } from "@/components/expenses/ExpensesOverview";
import { useLanguage } from "@/providers/language-provider";

export default function ExpensesPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        icon={Receipt}
        title={t("nav.expenses")}
        subtitle={t("nav.expensesSubtitle")}
        action={
          <HeaderAction
            href="/more/expenses/new"
            label={t("action.addExpense")}
            shortLabel={t("common.add")}
            icon={Plus}
          />
        }
      />
      <ScreenContent>
        <ExpensesOverview />
      </ScreenContent>
    </>
  );
}