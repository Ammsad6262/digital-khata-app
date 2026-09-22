"use client";

/**
 * Sale detail page.
 *
 * Server component shell — the actual content is a client component that
 * fetches the sale via React Query.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SaleDetail } from "@/components/sales/SaleDetail";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useLanguage();
  const { id } = await params;
  return (
    <>
      <AppHeader title={t("sale.saleDetail")} />
      <ScreenContent>
        <SaleDetail saleId={id} />
      </ScreenContent>
    </>
  );
}
