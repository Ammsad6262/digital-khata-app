"use client";

/**
 * Khata page — list of all customers with live search.
 */

import { Plus, BookOpen } from "lucide-react";
import { ScreenContent } from "@/components/layout/Screen";
import { PageHeader, HeaderAction } from "@/components/layout/PageHeader";
import { KhataList } from "@/components/khata/KhataList";
import { useLanguage } from "@/providers/language-provider";

export default function KhataPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        icon={BookOpen}
        title={t("nav.khata")}
        subtitle={t("nav.khataSubtitle")}
        action={
          <HeaderAction
            href="/more/customers/new"
            label={t("action.addCustomer")}
            shortLabel={t("common.add")}
            icon={Plus}
          />
        }
      />
      <ScreenContent>
        <KhataList />
      </ScreenContent>
    </>
  );
}