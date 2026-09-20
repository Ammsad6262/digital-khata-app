/**
 * Khata page — list of all customers with live search.
 *
 * Mobile-first layout:
 *   - Sticky search bar at top
 *   - Customer list with balance badges
 *   - Empty states for: no customers, no search results, error
 *   - Floating "+ Customer" button bottom-right
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { KhataList } from "@/components/khata/KhataList";


export default function KhataPage() {
  return (
    <>
      <AppHeader
        title="Khata"
        rightSlot={
          <Link
            href="/more/customers/new"
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label="Add customer"
          >
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <KhataList />
      </ScreenContent>
    </>
  );
}
