/**
 * Edit Product page.
 *
 * Server shell — the form is a client component.
 */

import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ProductForm } from "@/components/products/ProductForm";

export const dynamic = "force-dynamic";

export default function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <AppHeader title="Edit Product" />
      <ScreenContent>
        <ProductForm mode="edit" productId={params.id} />
      </ScreenContent>
    </>
  );
}
