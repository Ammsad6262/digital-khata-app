"use client";

/**
 * GrowthCard — the dashboard strip that tells the owner the single most
 * important thing to do right now, drawn from their own records.
 *
 * It renders nothing when there is nothing worth acting on, so it never
 * becomes background noise. Contact actions are inline, so the owner can
 * call or message the person without leaving the app.
 */

import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { ContactActions } from "@/components/shared/ContactActions";
import { Money } from "@/components/shared/Money";
import { growthContactMessage } from "@/components/shared/growth-message";
import { useGrowthPlan } from "@/hooks/use-growth";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useLanguage } from "@/providers/language-provider";
import type { GrowthRecommendation } from "@/lib/services/growth";

const TYPE_ICON: Record<GrowthRecommendation["type"], string> = {
  collect_receivables: "💰",
  restock: "📦",
  clear_dead_stock: "🏷️",
  reengage_customer: "👋",
  promote_product: "🚀",
  supplier_payment: "🚚",
};

export function GrowthCard() {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();
  const { data, isLoading } = useGrowthPlan();

  if (isLoading || !data) return null;

  const top = data.recommendations[0];
  if (!top) return null;

  const whatsappMessage = growthContactMessage(top, tParams, symbol);

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-3.5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-brand-700">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-brand-800">
          {t("dashboard.doThisNow")}
        </p>
        <Link
          href="/more/growth"
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-700 hover:underline"
        >
          {t("growth.title")}
          <ChevronRight className="h-3 w-3 rtl-flip" />
        </Link>
      </div>

      <div className="mt-2.5">
        <p className="text-sm font-semibold text-slate-900">
          <span className="mr-1">{TYPE_ICON[top.type]}</span>
          {top.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">{top.reason}</p>
        {top.amount ? (
          <p className="mt-1 text-sm font-semibold text-slate-800">
            <Money value={top.amount} />
            {top.amountLabel ? (
              <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                {t(top.amountLabel)}
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {top.contactPhone ? (
            <ContactActions phone={top.contactPhone} whatsappMessage={whatsappMessage} compact />
          ) : null}
          <Link
            href={top.href}
            className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-white px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
          >
            {t((top.actionLabelKey ?? "growth.open") as never)}
            <ChevronRight className="h-3 w-3 rtl-flip" />
          </Link>
        </div>
      </div>
    </section>
  );
}
