/**
 * New Sale page — placeholder.
 *
 * The full sale-entry form comes in a later phase. For now, this page just
 * confirms that the dashboard's quick-action button navigates correctly.
 */

import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

export default function NewSalePage() {
  return (
    <>
      <AppHeader
        title="New Sale"
        rightSlot={
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <EmptyState
          title="Sale form coming soon"
          description="The fast sale-entry screen will be built in the next phase. The dashboard and backend are ready."
          icon={<ShoppingCart className="h-6 w-6" />}
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
