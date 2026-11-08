"use client";

/**
 * Payments page — list of all payments with date filter chips.
 */

import { Wallet, Plus } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { PageHeader, HeaderAction } from "@/components/layout/PageHeader";
import { PaymentsList } from "@/components/payments/PaymentsList";
import { useLanguage } from "@/providers/language-provider";

export default function PaymentsPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        icon={Wallet}
        title={t("dashboard.todaysPayments")}
        subtitle={t("nav.paymentsSubtitle")}
        action={
          <HeaderAction
            href="/payments/new"
            label={t("action.addPayment")}
            shortLabel={t("common.add")}
            icon={Plus}
          />
        }
      />
      <ScreenContent>
        <PaymentsList />
      </ScreenContent>
    </>
  );
}