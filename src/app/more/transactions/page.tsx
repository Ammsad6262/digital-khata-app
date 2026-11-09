/**
 * Transactions page (/more/transactions).
 *
 * The unified Transaction History screen.
 * V13: Uses TranslatedHeader so the title is translated to user's language.
 */

import { ScreenContent } from "@/components/layout/Screen";
import { TranslatedHeader } from "@/components/layout/TranslatedHeader";
import { TransactionsList } from "@/components/transactions/TransactionsList";

export default function TransactionsPage() {
  return (
    <>
      <TranslatedHeader titleKey="transactions.title" backHref="/dashboard" />
      <ScreenContent>
        <TransactionsList />
      </ScreenContent>
    </>
  );
}
