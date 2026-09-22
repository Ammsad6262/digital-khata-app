"use client";

/**
 * Payment detail page.
 *
 * Server component shell — the actual content is a client component that
 * fetches via React Query.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { PaymentDetail as PaymentDetailComponent } from "@/components/payments/PaymentDetail";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useLanguage();
  const { id } = await params;
  return (
    <>
      <AppHeader title={t("payment.paymentDetail")} />
      <ScreenContent>
        <PaymentDetailComponent paymentId={id} />
      </ScreenContent>
    </>
  );
}
