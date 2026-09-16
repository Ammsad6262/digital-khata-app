/**
 * Products list page (/more/products).
 *
 * Mobile-first list of all products with search.
 * Each row: name, category, price, current stock.
 * Tappable → /more/products/[id]
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ProductsList } from "@/components/products/ProductsList";

export const dynamic = "force-dynamic";

export default function ProductsPage() {
  return (
    <>
      <AppHeader
        title="Products"
        rightSlot={
          <Link
            href="/more/products/new"
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label="Add product"
          >
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <ProductsList />
      </ScreenContent>
    </>
  );
}
