"use client";

/**
 * Edit-supplier page (/more/suppliers/[id]/edit).
 */

import { use } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { useLanguage } from "@/providers/language-provider";

export default function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("supplier.editSupplier")} />
      <ScreenContent>
        <SupplierForm mode="edit" supplierId={id} />
      </ScreenContent>
    </>
  );
}
