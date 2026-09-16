/**
 * Add Expense page — placeholder.
 */

import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

export default function NewExpensePage() {
  return (
    <>
      <AppHeader
        title="Add Expense"
        rightSlot={
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <EmptyState
          title="Expense form coming soon"
          description="The expense-entry screen will be built in the next phase."
          icon={<Receipt className="h-6 w-6" />}
          action={
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          }
        />
      </ScreenContent>
    </>
  );
}
