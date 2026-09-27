"use client";

/**
 * Payment detail page.
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <AppHeader
        title={t("payment.paymentDetail")}
        rightSlot={
          <Link
            href="/payments"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <PaymentDetailComponent paymentId={id} />
      </ScreenContent>
    </>
  );
}
