/**
 * Add Customer page.
 *
 * Server component shell — the actual form is a client component using
 * React Hook Form + Zod for validation.
 */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { AddCustomerForm } from "@/components/khata/AddCustomerForm";

export const dynamic = "force-dynamic";

export default function AddCustomerPage() {
  return (
    <>
      <AppHeader
        title="Add Customer"
        rightSlot={
          <Link
            href="/khata"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Back"
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
