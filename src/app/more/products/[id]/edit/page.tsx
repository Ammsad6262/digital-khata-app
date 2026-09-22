"use client";

/**
 * Edit Product page.
 *
 * Server shell — the form is a client component.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ProductForm } from "@/components/products/ProductForm";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useLanguage();
  const { id } = await params;
  return (
    <>
      <AppHeader title={t("product.editProduct")} />
      <ScreenContent>
        <ProductForm mode="edit" productId={id} />
      </ScreenContent>
    </>
  );
}
