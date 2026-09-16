/**
 * Payment detail page.
 *
 * Server component shell — the actual content is a client component that
 * fetches via React Query.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { PaymentDetail as PaymentDetailComponent } from "@/components/payments/PaymentDetail";

export const dynamic = "force-dynamic";

export default function PaymentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <AppHeader title="Payment Detail" />
      <ScreenContent>
        <PaymentDetailComponent paymentId={params.id} />
      </ScreenContent>
    </>
  );
}
