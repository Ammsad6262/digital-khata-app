/**
 * Sales list page.
 *
 * Shows recent sales with date filter chips (Today / Week / Month / All).
 * Each row shows customer name + total + outstanding badge.
 * Tappable → /sales/[id]
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SalesList } from "@/components/sales/SalesList";


export default function SalesPage() {
  return (
    <>
      <AppHeader
        title="Sales"
        rightSlot={
          <Link
            href="/sales/new"
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label="New sale"
          >
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <SalesList />
      </ScreenContent>
    </>
  );
}
