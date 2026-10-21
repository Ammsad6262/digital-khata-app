"use client";

/**
 * GrowthView — the AI Sales Growth Assistant UI.
 *
 * The recommendations and every number come from /api/growth, which reads
 * only the user's own records. The "Explain" button asks the AI to re-word
 * those facts; if the AI is unavailable or invents a number, the computed
 * summary is shown instead (clearly labelled).
 */

import Link from "next/link";
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
import { Money } from "@/components/shared/Money";
import { useGrowthPlan } from "@/hooks/use-growth";
import { apiPost } from "@/lib/utils/api-client";
import { useLanguage } from "@/providers/language-provider";
import type { GrowthPriority, GrowthRecommendation } from "@/lib/services/growth";

type Narration = { text: string; source: "ai" | "deterministic" };

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
  const { t } = useLanguage();

  return (
    <Link
      href={item.href}
      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-slate-300 hover:shadow-sm"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        {TYPE_ICON[item.type]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLE[item.priority]}`}>
            {t(`growth.priority.${item.priority}` as never)}
          </span>
        </div>

        <p className="mt-0.5 text-xs text-slate-500">{item.reason}</p>

        {item.amount && item.amountLabel ? (
          <p className="mt-1.5 text-sm font-semibold text-slate-800">
            <Money value={item.amount} />
            <span className="ml-1.5 text-[11px] font-normal text-slate-500">
              {t(item.amountLabel as never)}
            </span>
          </p>
        ) : null}
      </div>

      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}

export function GrowthView() {
  const { t } = useLanguage();
  const { data, isLoading, isError, refetch } = useGrowthPlan();

  const narration = useMutation<Narration>({
    mutationFn: () => apiPost<Narration>("/api/growth/summary", {}),
  });

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
      {/* Summary */}
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
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("growth.totals.receivables")}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900"><Money value={data.totals.receivables} /></p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("growth.totals.payables")}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900"><Money value={data.totals.payables} /></p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("growth.totals.deadStock")}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900"><Money value={data.totals.deadStockValue} /></p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={narration.isPending || data.recommendations.length === 0}
            onClick={() => narration.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300"
          >
            {narration.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {narration.isPending ? t("growth.explaining") : t("growth.explain")}
          </button>
          <span className="text-[11px] text-slate-400">{t("growth.evidenceNote")}</span>
        </div>

        {narration.data ? (
          <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
              {narration.data.source === "ai" ? t("growth.aiBadge") : t("growth.computedBadge")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{narration.data.text}</p>
          </div>
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
