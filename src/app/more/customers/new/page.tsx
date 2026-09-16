/**
 * Add Customer page — placeholder.
 */

import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

export default function NewCustomerPage() {
  return (
    <>
      <AppHeader
        title="Add Customer"
        rightSlot={
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <EmptyState
          title="Customer form coming soon"
          description="The customer-entry screen will be built in the next phase."
          icon={<UserPlus className="h-6 w-6" />}
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
