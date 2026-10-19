"use client";

/**
 * Record-payment page (/more/suppliers/[id]/payment/new).
 */

import { use } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SupplierPaymentForm } from "@/components/suppliers/SupplierPaymentForm";
import { useLanguage } from "@/providers/language-provider";

export default function NewSupplierPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("supplierPayment.recordPayment")} />
      <ScreenContent>
        <SupplierPaymentForm supplierId={id} />
      </ScreenContent>
    </>
  );
}
