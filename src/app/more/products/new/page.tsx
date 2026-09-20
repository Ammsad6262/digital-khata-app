"use client";

/**
 * Add Product page (/more/products/new).
 *
 * Replaces the placeholder. Uses a client component form.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { ProductForm } from "@/components/products/ProductForm";
import { useLanguage } from "@/providers/language-provider";


export default function AddProductPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("stock.addProduct")}
        rightSlot={
          <Link
            href="/more/products"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <ProductForm mode="create" />
      </ScreenContent>
    </>
  );
}
