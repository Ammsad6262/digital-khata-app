/**
 * Add Payment page — placeholder.
 */

import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

export default function NewPaymentPage() {
  return (
    <>
      <AppHeader
        title="Add Payment"
        rightSlot={
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <EmptyState
          title="Payment form coming soon"
          description="The quick payment-entry screen will be built in the next phase."
          icon={<Wallet className="h-6 w-6" />}
          action={
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          }
        />
      </ScreenContent>
    </>
  );
}
