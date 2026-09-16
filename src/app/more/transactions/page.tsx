/**
 * Transactions page (/more/transactions).
 *
 * The unified Transaction History screen.
 *
 * Shows all financial movements across the business:
 *   - Sales, payments, expenses, stock moves, balance adjustments
 *
 * Filters:
 *   - Date range: Today / This Week / This Month / All / Custom
 *   - Type: All / Sales / Payments / Expenses / Stock / Adjustments
 *
 * Each row is tappable and navigates to the appropriate detail page
 * (sale detail, payment detail, expense detail, product detail, customer khata).
 *
 * Mobile-first: filter chips scroll horizontally, rows are compact.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { TransactionsList } from "@/components/transactions/TransactionsList";

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  return (
    <>
      <AppHeader title="Transactions" />
      <ScreenContent>
        <TransactionsList />
      </ScreenContent>
    </>
  );
}
