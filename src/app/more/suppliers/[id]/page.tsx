"use client";

/**
 * Supplier detail page (/more/suppliers/[id]).
 */

import { use } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SupplierDetail } from "@/components/suppliers/SupplierDetail";
import { useLanguage } from "@/providers/language-provider";

export default function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("supplier.supplierDetail")} />
      <ScreenContent>
        <SupplierDetail supplierId={id} />
      </ScreenContent>
    </>
  );
}
