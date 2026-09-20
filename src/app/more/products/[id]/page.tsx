"use client";

/**
 * Product detail page (/more/products/[id]).
 *
 * Shows:
 *   - Product info (name, category, SKU)
 *   - Current stock hero (color-coded)
 *   - Prices (purchase + selling)
 *   - Quick actions: Add Stock, Adjust Stock, Edit
 *   - Stock movement history (chronological, with running balance after each)
 */

import Link from "next/link";
import { Pencil } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ProductDetail } from "@/components/products/ProductDetail";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("product.productDetail")}
        rightSlot={
          <Link
            href={`/more/products/${params.id}/edit`}
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label={t("common.edit")}
          >
            <Pencil className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <ProductDetail productId={params.id} />
      </ScreenContent>
    </>
  );
}
