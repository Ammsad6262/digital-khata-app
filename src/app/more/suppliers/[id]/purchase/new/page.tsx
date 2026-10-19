"use client";

/**
 * Add-purchase page (/more/suppliers/[id]/purchase/new).
 */

import { use } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { PurchaseForm } from "@/components/suppliers/PurchaseForm";
import { useLanguage } from "@/providers/language-provider";

export default function NewPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("purchase.newPurchase")} />
      <ScreenContent>
        <PurchaseForm supplierId={id} />
      </ScreenContent>
    </>
  );
}
