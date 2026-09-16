/**
 * Customer detail (khata) page.
 *
 * Server component shell — the actual content is a client component that
 * fetches the customer's history (with running balance) via React Query.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { CustomerDetail } from "@/components/khata/CustomerDetail";

export const dynamic = "force-dynamic";

export default function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <AppHeader title="Customer Khata" />
      <ScreenContent>
        <CustomerDetail customerId={params.id} />
      </ScreenContent>
    </>
  );
}
