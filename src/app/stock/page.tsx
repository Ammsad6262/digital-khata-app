"use client";
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
