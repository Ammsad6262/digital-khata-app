"use client";

/**
 * Edit customer page. Next.js 16 params are a Promise, so unwrap with use().
 */

import { use } from "react";
import { ScreenContent } from "@/components/layout/Screen";
import { TranslatedHeader } from "@/components/layout/TranslatedHeader";
import { EditCustomerForm } from "@/components/khata/EditCustomerForm";

export const dynamic = "force-dynamic";

export default function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <>
      <TranslatedHeader titleKey="customer.editCustomer" backHref={`/khata/${id}`} />
      <ScreenContent>
        <EditCustomerForm customerId={id} />
      </ScreenContent>
    </>
  );
}
