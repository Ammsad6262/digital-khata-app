/**
 * Transactions page — placeholder.
 *
 * Will show the full transaction history with filters (today/week/month/all).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { EmptyState } from "@/components/shared/EmptyState";
import { Receipt } from "lucide-react";

export default function TransactionsPage() {
  return (
    <>
      <AppHeader title="Transactions" />
      <ScreenContent>
        <EmptyState
          title="Transaction history coming soon"
          description="The full transaction feed with date filters will be built in a later phase."
          icon={<Receipt className="h-6 w-6" />}
        />
      </ScreenContent>
    </>
  );
}
