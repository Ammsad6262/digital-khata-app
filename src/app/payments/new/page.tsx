"use client";

/**
 * Add Payment page.
 *
 * Server component shell — the form is a client component using React Query.
 *
 * The form supports an optional ?customerId=... query param so the
 * "Add Payment" button on a customer's khata page can pre-fill the customer.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { AddPaymentForm } from "@/components/payments/AddPaymentForm";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default function NewPaymentPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("action.addPayment")}
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
        <Suspense fallback={null}>
          <AddPaymentForm />
        </Suspense>
      </ScreenContent>
    </>
  );
}
