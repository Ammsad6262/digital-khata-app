"use client";

/**
 * GrowthView — the AI Sales Growth Assistant UI.
 *
 * The recommendations and every number come from /api/growth, which reads
 * only the user's own records. The AI only re-words those facts; if it is
 * unavailable or invents a number, the computed summary is shown instead.
 *
 * Every action that involves a person carries one-tap Call / WhatsApp
 * buttons, with the message already written — the owner never has to leave
 * the app or look the number up.
 */

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  Loader2,
  Package,
  Sparkles,
  TrendingUp,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { ContactActions } from "@/components/shared/ContactActions";
import { Money } from "@/components/shared/Money";
import { growthContactMessage } from "@/components/shared/growth-message";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useGrowthPlan } from "@/hooks/use-growth";
import { apiPost } from "@/lib/utils/api-client";
import { useLanguage } from "@/providers/language-provider";
import type { GrowthPriority, GrowthRecommendation } from "@/lib/services/growth";

type Narration = {
  text: string;
  source: "ai" | "deterministic";
  reason?: string;
};

const PRIORITY_STYLE: Record<GrowthPriority, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

const TYPE_ICON: Record<GrowthRecommendation["type"], React.ReactNode> = {
  collect_receivables: <Wallet className="h-4 w-4" />,
  restock: <Package className="h-4 w-4" />,
  clear_dead_stock: <Archive className="h-4 w-4" />,
  reengage_customer: <UserRound className="h-4 w-4" />,
  promote_product: <TrendingUp className="h-4 w-4" />,
  supplier_payment: <Truck className="h-4 w-4" />,
};

function RecommendationCard({ item }: { item: GrowthRecommendation }) {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();

  // A ready-to-send message. Nothing is sent without the owner pressing send.
  const whatsappMessage = growthContactMessage(item, tParams, symbol);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          {TYPE_ICON[item.type]}
        </span>

        <div className="min-w-0 flex-1">
          <Link href={item.href} className="block">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLE[item.priority]}`}
              >
                {t(`growth.priority.${item.priority}` as never)}
              </span>
            </div>

            <p className="mt-0.5 text-xs text-slate-500">{item.reason}</p>

            {item.amount ? (
              <p className="mt-1.5 text-sm font-semibold text-slate-800">
                <Money value={item.amount ?? "0"} />
                {item.amountLabel ? (
                  <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                    {t(item.amountLabel)}
                  </span>
                ) : null}
              </p>
            ) : null}

            {item.reorder ? (
              <p className="mt-1.5 text-xs text-slate-600">
                {t("growth.suggestedOrder")}{" "}
                <span className="font-semibold text-slate-800">
                  {item.reorder.quantity} {item.reorder.unit}
                </span>
              </p>
            ) : null}

            <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand-700">
              {t((item.actionLabelKey ?? "growth.open") as never)}
              <ArrowRight className="h-3 w-3 rtl-flip" />
            </span>
          </Link>

          {item.contactPhone ? (
            <ContactActions
              phone={item.contactPhone}
              whatsappMessage={whatsappMessage}
              className="mt-2.5"
              compact
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function GrowthView() {
  const { t } = useLanguage();
  const { data, isLoading, isError, refetch } = useGrowthPlan();

  const narration = useMutation<Narration>({
    mutationFn: () => apiPost<Narration>("/api/growth/summary", {}),
  });

  // Ask for the explanation as soon as the plan is on screen, so the page
  // arrives already telling the owner what to do. The answer is cached for
  // 10 minutes per business, so opening the page again costs nothing.
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    if (!data || data.recommendations.length === 0) return;
    requested.current = true;
    narration.mutate();
  }, [data, narration]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {t("growth.error")}
        <button type="button" onClick={() => refetch()} className="ml-2 underline">
          {t("growth.retry")}
        </button>
      </div>
    );
  }

  const high = data.recommendations.filter((r) => r.priority === "high");
  const medium = data.recommendations.filter((r) => r.priority === "medium");
  const low = data.recommendations.filter((r) => r.priority === "low");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">{t("growth.subtitle")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{data.summary}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t("growth.totals.receivables")}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              <Money value={data.totals.receivables} />
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t("growth.totals.payables")}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              <Money value={data.totals.payables} />
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t("growth.totals.deadStock")}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              <Money value={data.totals.deadStockValue} />
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={narration.isPending || data.recommendations.length === 0}
            onClick={() => narration.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300"
          >
            {narration.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {narration.isPending
              ? t("growth.explaining")
              : narration.data
                ? t("growth.refreshAi")
                : t("growth.explain")}
          </button>
          <span className="text-[11px] text-slate-400">{t("growth.evidenceNote")}</span>
        </div>

        {narration.isError ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">{t("growth.aiBusy")}</p>
            <button
              type="button"
              onClick={() => narration.mutate()}
              className="shrink-0 text-xs font-semibold text-amber-900 underline"
            >
              {t("growth.retry")}
            </button>
          </div>
        ) : narration.data ? (
          narration.data.source === "ai" ? (
            <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                {t("growth.aiBadge")}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{narration.data.text}</p>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">{t("growth.aiBusy")}</p>
              <button
                type="button"
                onClick={() => narration.mutate()}
                className="shrink-0 text-xs font-semibold text-amber-900 underline"
              >
                {t("growth.retry")}
              </button>
            </div>
          )
        ) : null}
      </section>

      {data.recommendations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {t("growth.empty")}
        </div>
      ) : (
        <>
          {[
            { key: "high", items: high, label: t("growth.group.high") },
            { key: "medium", items: medium, label: t("growth.group.medium") },
            { key: "low", items: low, label: t("growth.group.low") },
          ].map((group) =>
            group.items.length > 0 ? (
              <section key={group.key} className="space-y-2">
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group.label} · {group.items.length}
                </h3>
                {group.items.map((item) => (
                  <RecommendationCard key={item.id} item={item} />
                ))}
              </section>
            ) : null,
          )}
        </>
      )}
    </div>
  );
}
