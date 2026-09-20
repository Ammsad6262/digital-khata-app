"use client";

/**
 * Add Customer page.
 *
 * Lazy-loads the form (React Hook Form + Zod resolver) to keep the
 * initial bundle small. The form is only needed when the user navigates
 * to this page.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { useLanguage } from "@/providers/language-provider";

const AddCustomerForm = dynamic(
  () => import("@/components/khata/AddCustomerForm").then((m) => m.AddCustomerForm),
  {
    loading: () => (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
      </div>
    ),
  },
);

export default function AddCustomerPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("action.addCustomer")}
        rightSlot={
          <Link
            href="/khata"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <AddCustomerForm />
      </ScreenContent>
    </>
  );
}
