/**
 * Payments list page.
 *
 * Shows recent payments with date filter chips (Today / Week / Month / All).
 * Each row shows customer name + amount + method badge + date.
 * Tappable → /payments/[id]
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { PaymentsList } from "@/components/payments/PaymentsList";


export default function PaymentsPage() {
  return (
    <>
      <AppHeader
        title="Payments"
        rightSlot={
          <Link
            href="/payments/new"
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label="Add payment"
          >
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <PaymentsList />
      </ScreenContent>
    </>
  );
}
