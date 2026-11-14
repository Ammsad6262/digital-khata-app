"use client";

/**
 * /khata/outstanding — "Who owes you" page.
 *
 * Reached by tapping the "X customers owe you Rs. Y" hero card on the
 * dashboard. Lists every customer with a positive balance, sorted by
 * balance descending. Each row → /khata/[id] for the full ledger.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { OutstandingCustomersList } from "@/components/khata/OutstandingCustomersList";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { useLanguage } from "@/providers/language-provider";

export const dynamic = "force-dynamic";

export default function OutstandingCustomersPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  return (
    <>
      <AppHeader
        title={t("outstanding.title")}
        rightSlot={
          <Link
            href="/dashboard"
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-2"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <ScreenContent>
        <PullToRefresh onRefresh={() => queryClient.invalidateQueries()}>
          <OutstandingCustomersList />
        </PullToRefresh>
      </ScreenContent>
    </>
  );
}
