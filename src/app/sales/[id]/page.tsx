"use client";

/**
 * Sale detail page.
 *
 * Server component shell — the actual content is a client component that
 * fetches the sale via React Query.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SaleDetail } from "@/components/sales/SaleDetail";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default function SaleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("sale.saleDetail")} />
      <ScreenContent>
        <SaleDetail saleId={params.id} />
      </ScreenContent>
    </>
  );
}
