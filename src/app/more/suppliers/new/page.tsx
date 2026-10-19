"use client";

/**
 * Add-supplier page (/more/suppliers/new).
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { useLanguage } from "@/providers/language-provider";

export default function NewSupplierPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("supplier.newSupplier")} />
      <ScreenContent>
        <SupplierForm mode="create" />
      </ScreenContent>
    </>
  );
}
