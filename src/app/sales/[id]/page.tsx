"use client";

/**
 * Sale detail page.
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <AppHeader
        title={t("sale.saleDetail")}
        rightSlot={
          <Link
            href="/sales"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <SaleDetail saleId={id} />
      </ScreenContent>
    </>
  );
}
