"use client";

/**
 * Customer detail (khata) page.
 *
 * Server component shell — the actual content is a client component that
 * fetches the customer's history (with running balance) via React Query.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { CustomerDetail } from "@/components/khata/CustomerDetail";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useLanguage();
  const { id } = await params;
  return (
    <>
      <AppHeader title={t("customer.customerKhata")} />
      <ScreenContent>
        <CustomerDetail customerId={id} />
      </ScreenContent>
    </>
  );
}
