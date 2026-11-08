"use client";

/**
 * Sales page — list of all sales with date filter chips.
 */

import { BarChart3, Plus } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { PageHeader, HeaderAction } from "@/components/layout/PageHeader";
import { SalesList } from "@/components/sales/SalesList";
import { useLanguage } from "@/providers/language-provider";

export default function SalesPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        icon={BarChart3}
        title={t("nav.sales")}
        subtitle={t("nav.salesSubtitle")}
        action={
          <HeaderAction
            href="/sales/new"
            label={t("action.newSale")}
            shortLabel={t("common.add")}
            icon={Plus}
          />
        }
      />
      <ScreenContent>
        <SalesList />
      </ScreenContent>
    </>
  );
}