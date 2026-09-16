/**
 * New Sale page.
 *
 * Server component shell — the form is a client component using React Query.
 *
 * The form supports an optional ?customerId=... query param so the
 * "New Sale" button on a customer's khata page can pre-fill the customer.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { NewSaleForm } from "@/components/sales/NewSaleForm";

export const dynamic = "force-dynamic";

export default function NewSalePage() {
  return (
    <>
      <AppHeader
        title="New Sale"
        rightSlot={
          <Link
            href="/sales"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Back"
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
