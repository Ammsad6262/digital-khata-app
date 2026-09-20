"use client";

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
import { useLanguage } from "@/providers/language-provider";


export default function PaymentsPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("dashboard.todaysPayments")}
        rightSlot={
          <Link
            href="/payments/new"
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label={t("action.addPayment")}
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
