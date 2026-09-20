"use client";

/**
 * New Sale page.
 *
 * Lazy-loads the sale form to keep the initial bundle small.
 * The form + React Hook Form + Zod is only loaded when the user
 * navigates to create a sale.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { useLanguage } from "@/providers/language-provider";

const NewSaleForm = dynamic(
  () => import("@/components/sales/NewSaleForm").then((m) => m.NewSaleForm),
  {
    loading: () => (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
      </div>
    ),
  },
);

export default function NewSalePage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("action.newSale")}
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
        <Suspense fallback={null}>
          <NewSaleForm />
        </Suspense>
      </ScreenContent>
    </>
  );
}
