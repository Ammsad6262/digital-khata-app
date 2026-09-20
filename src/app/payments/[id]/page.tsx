"use client";

/**
 * Payment detail page.
 *
 * Server component shell — the actual content is a client component that
 * fetches via React Query.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { PaymentDetail as PaymentDetailComponent } from "@/components/payments/PaymentDetail";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default function PaymentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("payment.paymentDetail")} />
      <ScreenContent>
        <PaymentDetailComponent paymentId={params.id} />
      </ScreenContent>
    </>
  );
}
