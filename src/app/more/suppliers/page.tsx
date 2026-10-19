"use client";

/**
 * Suppliers list page (/more/suppliers).
 *
 * Shows who the business buys stock from and what is owed to each.
 * Tappable row → /more/suppliers/[id]
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { SuppliersList } from "@/components/suppliers/SuppliersList";
import { useLanguage } from "@/providers/language-provider";

export default function SuppliersPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader
        title={t("more.suppliers")}
        rightSlot={
          <Link
            href="/more/suppliers/new"
            className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
            aria-label={t("supplier.addSupplier")}
          >
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <SuppliersList />
      </ScreenContent>
    </>
  );
}
