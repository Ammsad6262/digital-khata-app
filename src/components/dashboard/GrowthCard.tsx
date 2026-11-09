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
import {
  ChevronRight,
  Sparkles,
  HandCoins,
  PackagePlus,
  Tag,
  MessageCircle,
  Rocket,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { ContactActions } from "@/components/shared/ContactActions";
import { Money } from "@/components/shared/Money";
import { growthContactMessage } from "@/components/shared/growth-message";
import { useGrowthPlan } from "@/hooks/use-growth";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useLanguage } from "@/providers/language-provider";
import type { GrowthRecommendation } from "@/lib/services/growth";

const TYPE_ICON: Record<GrowthRecommendation["type"], LucideIcon> = {
  collect_receivables: HandCoins,
  restock: PackagePlus,
  clear_dead_stock: Tag,
  reengage_customer: MessageCircle,
  promote_product: Rocket,
  supplier_payment: Truck,
};

export function GrowthCard() {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();
  const { data, isLoading } = useGrowthPlan();

  if (isLoading || !data) return null;

  const top = data.recommendations[0];
  if (!top) return null;

  const whatsappMessage = growthContactMessage(top, tParams, symbol);
  const Icon = TYPE_ICON[top.type] ?? Sparkles;

  return (
    <section className="brand-wash relative overflow-hidden rounded-card border border-brand-500/20 p-3.5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-[0.6rem] bg-brand-600 text-white shadow-brand">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="flex-1 text-[11px] font-semibold text-brand-800">
          {t("dashboard.doThisNow")}
        </p>
        <Link
          href="/more/growth"
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-brand-700 hover:underline"
        >
          {t("growth.title")}
          <ChevronRight className="h-3 w-3 rtl-flip" />
        </Link>
      </div>

      <div className="mt-2.5">
        <p className="flex items-start gap-1.5 text-[13px] font-semibold text-ink">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
          <span>{top.titleKey ? tParams(top.titleKey, top.titleParams ?? {}) : top.title}</span>
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
          {top.reasonKey ? tParams(top.reasonKey, top.reasonParams ?? {}) : top.reason}
        </p>
        {top.amount ? (
          <p className="mt-1.5 text-[13px] font-semibold text-ink">
            <Money value={top.amount} />
            {top.amountLabel ? (
              <span className="ml-1.5 text-[10px] font-normal text-ink-subtle">
                {t(top.amountLabel)}
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {top.contactPhone ? (
            <ContactActions
              phone={top.contactPhone}
              whatsappMessage={whatsappMessage}
              compact
            />
          ) : null}
          <Link
            href={top.href}
            className="inline-flex items-center gap-1 rounded-[0.55rem] border border-brand-500/20 bg-surface px-2.5 py-1 text-[10px] font-semibold text-brand-700 transition-colors hover:bg-surface-2"
          >
            {t((top.actionLabelKey ?? "growth.open") as never)}
            <ChevronRight className="h-3 w-3 rtl-flip" />
          </Link>
        </div>
      </div>
    </section>
  );
}