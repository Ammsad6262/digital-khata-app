"use client";

/**
 * Stock overview page.
 *
 * Mobile-first list of all products with their current stock + low-stock alerts.
 * Each row shows: product name, current stock (color-coded), category.
 * Tappable → /more/products/[id] (full product detail with movement history).
 *
 * Quick actions:
 *   - + Add Stock → /stock/add (purchase from supplier)
 *   - Adjust Stock → /stock/adjust (recount/write-off)
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { StockOverview } from "@/components/stock/StockOverview";
import { useLanguage } from "@/providers/language-provider";


export default function StockPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("nav.stock")} />
      <ScreenContent>
        <StockOverview />
      </ScreenContent>
    </>
  );
}
