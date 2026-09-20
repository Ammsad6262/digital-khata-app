"use client";

/**
 * Edit Product page.
 *
 * Server shell — the form is a client component.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ProductForm } from "@/components/products/ProductForm";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("product.editProduct")} />
      <ScreenContent>
        <ProductForm mode="edit" productId={params.id} />
      </ScreenContent>
    </>
  );
}
