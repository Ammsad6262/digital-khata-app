"use client";

/**
 * Add Stock page.
 *
 * Records a "purchase" stock move — buying new stock from a supplier.
 * Increases the product's stock by the entered quantity.
 *
 * Fields:
 *   - Product (search by name/SKU)
 *   - Quantity (positive number)
 *   - Unit cost (optional — used for V2 profit reports)
 *   - Reason / note (optional)
 *   - Date (defaults to today)
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { AddStockForm } from "@/components/stock/AddStockForm";
import { useLanguage } from "@/providers/language-provider";


export default function AddStockPage({
  searchParams,
}: {
  searchParams: { productId?: string };
}) {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("stock.addStock")}
        rightSlot={
          <Link
            href="/stock"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <AddStockForm initialProductId={searchParams.productId} />
      </ScreenContent>
    </>
  );
}
