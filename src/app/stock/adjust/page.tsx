/**
 * Stock adjust page.
 *
 * Records a stock adjustment — for recounts, write-offs, damages, returns
 * from customers (where the goods go back into stock).
 *
 * Unlike "add stock" (always positive), adjustments can be:
 *   - positive (adding found stock, customer return)
 *   - negative (write-off, damage, recount downward)
 *
 * Each adjustment is RECORDED as a StockMove row — we never silently edit
 * historical moves. The full history is visible on the product detail page.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { AdjustStockForm } from "@/components/stock/AdjustStockForm";


export default function AdjustStockPage({
  searchParams,
}: {
  searchParams: { productId?: string };
}) {
  return (
    <>
      <AppHeader
        title="Adjust Stock"
        rightSlot={
          <Link
            href="/stock"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <AdjustStockForm initialProductId={searchParams.productId} />
      </ScreenContent>
    </>
  );
}
