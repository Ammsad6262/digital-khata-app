"use client";

/**
 * Stock page — list of all products with current stock levels.
 */

import { Package } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { PageHeader } from "@/components/layout/PageHeader";
import { StockOverview } from "@/components/stock/StockOverview";
import { StockAddMenu } from "@/components/stock/StockAddMenu";
import { useLanguage } from "@/providers/language-provider";

export default function StockPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        icon={Package}
        title={t("nav.stock")}
        subtitle={t("nav.stockSubtitle")}
        action={<StockAddMenu />}
      />
      <ScreenContent>
        <StockOverview />
      </ScreenContent>
    </>
  );
}