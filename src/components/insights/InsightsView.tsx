"use client";

/**
 * InsightsView — evidence-based business insights.
 *
 * Every number comes from /api/insights, which reads only the user's own
 * records. Nothing here is estimated.
 */

import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Clock,
  Flame,
  Minus,
  Receipt,
  TrendingUp,
  Truck,
} from "lucide-react";
import { Money } from "@/components/shared/Money";
import { useInsights } from "@/hooks/use-insights";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useLanguage } from "@/providers/language-provider";
import type { SalesTrend } from "@/lib/services/insights";

function ChangeBadge({
  pct,
  noBaselineLabel,
}: {
  pct: number | null;
  noBaselineLabel: string;
}) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
        <Minus className="h-3 w-3" />
        {noBaselineLabel}
      </span>
    );
  }
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
        up ? "text-emerald-700" : "text-red-600"
      }`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Section({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start gap-2 border-b border-slate-100 px-4 py-3">
        <span className="mt-0.5 text-slate-400">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function TrendRow({
  label,
  value,
  changePct,
  noBaseline,
  symbol,
}: {
  label: string;
  value: string;
  changePct: number | null;
  noBaseline: string;
  symbol: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">
          <Money value={value} symbol={symbol} />
        </span>
        <ChangeBadge pct={changePct} noBaselineLabel={noBaseline} />
      </div>
    </div>
  );
}

export function InsightsView() {
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  const { data, isLoading, isError, error } = useInsights();

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-8 text-center text-sm text-red-600">
        {error instanceof Error ? error.message : t("common.couldntLoad")}
      </p>
    );
  }

  const trend: SalesTrend = data.salesTrend;

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-slate-500">{t("insights.basedOnRecords")}</p>

      {/* Money in / money out */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
          <p className="text-xs font-medium text-emerald-700">{t("insights.receivables")}</p>
          <p className="mt-1 text-lg font-bold text-emerald-800">
            <Money value={data.receivables.total} symbol={symbol} />
          </p>
          <p className="text-[11px] text-emerald-700">
            {data.receivables.customersCount} {t("insights.customers")}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <p className="text-xs font-medium text-amber-700">{t("insights.payables")}</p>
          <p className="mt-1 text-lg font-bold text-amber-800">
            <Money value={data.payables.total} symbol={symbol} />
          </p>
          <p className="text-[11px] text-amber-700">
            {data.payables.suppliersCount} {t("insights.suppliers")}
          </p>
        </div>
      </div>

      {/* Overdue — only when something is actually past its date */}
      {Number(data.overdue.total) > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-red-700">{t("insights.overdue")}</p>
              <p className="mt-1 text-lg font-bold text-red-800">
                <Money value={data.overdue.total} symbol={symbol} />
              </p>
              <p className="text-[11px] text-red-700">
                {data.overdue.salesCount}{" "}
                {t(
                  data.overdue.salesCount === 1
                    ? "insights.saleOne"
                    : "insights.salesWord",
                )}{" "}
                · {data.overdue.customersCount}{" "}
                {t(
                  data.overdue.customersCount === 1
                    ? "insights.customerOne"
                    : "insights.customers",
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-red-600">{t("insights.overdueHint")}</p>
            </div>
            <Link
              href="/sales"
              className="shrink-0 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
            >
              {t("insights.viewSales")}
            </Link>
          </div>
        </div>
      ) : null}

      {/* Overdue supplier invoices — only when one actually exists */}
      {Number(data.overduePayables.total) > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-800">
                {t("insights.overduePayables")}
              </p>
              <p className="mt-1 text-lg font-bold text-amber-900">
                <Money value={data.overduePayables.total} symbol={symbol} />
              </p>
              <p className="text-[11px] text-amber-800">
                {data.overduePayables.invoicesCount}{" "}
                {t(
                  data.overduePayables.invoicesCount === 1
                    ? "insights.invoiceOne"
                    : "insights.invoices",
                )}{" "}
                · {data.overduePayables.suppliersCount}{" "}
                {t(
                  data.overduePayables.suppliersCount === 1
                    ? "insights.supplierOne"
                    : "insights.suppliers",
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700">
                {t("insights.overduePayablesHint")}
              </p>
            </div>
            <Link
              href="/more/suppliers"
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
            >
              {t("insights.viewSuppliers")}
            </Link>
          </div>
        </div>
      ) : null}

      {/* Sales trend */}
      <Section title={t("insights.salesTrend")} icon={<TrendingUp className="h-4 w-4" />}>
        <div className="divide-y divide-slate-100">
          <TrendRow
            label={t("insights.thisMonth")}
            value={trend.thisMonth}
            changePct={trend.changePct}
            noBaseline={t("insights.noBaseline")}
            symbol={symbol}
          />
          <TrendRow
            label={t("insights.thisWeek")}
            value={trend.thisWeek}
            changePct={trend.weekChangePct}
            noBaseline={t("insights.noBaseline")}
            symbol={symbol}
          />
        </div>
      </Section>

      {/* Best sellers */}
      <Section title={t("insights.topProducts")} icon={<Flame className="h-4 w-4" />}>
        {data.topProducts.length === 0 ? (
          <p className="text-sm text-slate-500">{t("insights.noTopProducts")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.topProducts.map((p, index) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/more/products/${p.id}`} className="truncate text-sm font-medium text-slate-900">
                    {p.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {p.quantity} {p.unit}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-900">
                  <Money value={p.revenue} symbol={symbol} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Slow movers */}
      <Section
        title={t("insights.slowMovers")}
        hint={t("insights.slowMoversHint")}
        icon={<Boxes className="h-4 w-4" />}
      >
        {data.slowMovers.length === 0 ? (
          <p className="text-sm text-slate-500">{t("insights.noSlowMovers")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.slowMovers.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/more/products/${p.id}`} className="truncate text-sm font-medium text-slate-900">
                    {p.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {p.currentStock} {p.unit}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-400">{t("insights.stockValue")}</p>
                  <p className="text-sm font-semibold text-slate-900">
                    <Money value={p.stockValue} symbol={symbol} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Low stock */}
      <Section title={t("insights.lowStock")} icon={<Receipt className="h-4 w-4" />}>
        {data.lowStock.length === 0 ? (
          <p className="text-sm text-slate-500">{t("insights.noLowStock")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.lowStock.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/more/products/${p.id}`} className="truncate text-sm font-medium text-slate-900">
                  {p.name}
                </Link>
                <span className="shrink-0 text-xs text-red-600">
                  {p.currentStock} {p.unit}
                  <span className="text-slate-400"> · {t("insights.threshold")}: {p.threshold}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Quiet customers who owe money */}
      <Section
        title={t("insights.inactiveCustomers")}
        hint={t("insights.inactiveCustomersHint")}
        icon={<Clock className="h-4 w-4" />}
      >
        {data.inactiveCustomers.length === 0 ? (
          <p className="text-sm text-slate-500">{t("insights.noInactiveCustomers")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.inactiveCustomers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/khata/${c.id}`} className="truncate text-sm font-medium text-slate-900">
                    {c.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {c.daysInactive === null
                      ? t("insights.neverActive")
                      : `${c.daysInactive} ${t("insights.daysInactive")}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-amber-700">
                  <Money value={c.balance} symbol={symbol} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="px-1 pb-2 text-center text-[11px] text-slate-400">
        <Truck className="mr-1 inline h-3 w-3" />
        {t("insights.range")}
      </p>
    </div>
  );
}
