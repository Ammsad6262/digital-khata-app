"use client";

/**
 * Customer detail (khata) page.
 *
 * Server component shell — the actual content is a client component that
 * fetches the customer's history (with running balance) via React Query.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { CustomerDetail } from "@/components/khata/CustomerDetail";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("customer.customerKhata")} />
      <ScreenContent>
        <CustomerDetail customerId={params.id} />
      </ScreenContent>
    </>
  );
}
