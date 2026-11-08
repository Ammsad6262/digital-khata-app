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
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
        <Minus className="h-3 w-3" />
        {noBaselineLabel}
      </span>
    );
  }
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
        up ? "text-success-ink" : "text-danger-ink"
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
    <section className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-start gap-2 border-b border-line px-4 py-3">
        <span className="mt-0.5 text-ink-faint">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
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
      <span className="text-sm text-ink-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">
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
    return <p className="py-8 text-center text-sm text-ink-subtle">{t("common.loading")}</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-8 text-center text-sm text-danger-ink">
        {error instanceof Error ? error.message : t("common.couldntLoad")}
      </p>
    );
  }

  const trend: SalesTrend = data.salesTrend;

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-ink-subtle">{t("insights.basedOnRecords")}</p>

      {/* Money in / money out */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-success/20 bg-success-soft p-3.5">
          <p className="text-xs font-medium text-success-ink">{t("insights.receivables")}</p>
          <p className="mt-1 text-lg font-bold text-success-ink">
            <Money value={data.receivables.total} symbol={symbol} />
          </p>
          <p className="text-[11px] text-success-ink">
            {data.receivables.customersCount} {t("insights.customers")}
          </p>
        </div>
        <div className="rounded-xl border border-warning/25 bg-warning-soft p-3.5">
          <p className="text-xs font-medium text-warning-ink">{t("insights.payables")}</p>
          <p className="mt-1 text-lg font-bold text-warning-ink">
            <Money value={data.payables.total} symbol={symbol} />
          </p>
          <p className="text-[11px] text-warning-ink">
            {data.payables.suppliersCount} {t("insights.suppliers")}
          </p>
        </div>
      </div>

      {/* Overdue — only when something is actually past its date */}
      {Number(data.overdue.total) > 0 ? (
        <div className="rounded-xl border border-danger/20 bg-danger-soft p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-danger-ink">{t("insights.overdue")}</p>
              <p className="mt-1 text-lg font-bold text-danger-ink">
                <Money value={data.overdue.total} symbol={symbol} />
              </p>
              <p className="text-[11px] text-danger-ink">
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
              <p className="mt-0.5 text-[11px] text-danger-ink">{t("insights.overdueHint")}</p>
            </div>
            <Link
              href="/sales"
              className="shrink-0 rounded-lg border border-danger/40 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-danger-ink hover:bg-danger-soft"
            >
              {t("insights.viewSales")}
            </Link>
          </div>
        </div>
      ) : null}

      {/* Overdue supplier invoices — only when one actually exists */}
      {Number(data.overduePayables.total) > 0 ? (
        <div className="rounded-xl border border-warning/25 bg-warning-soft p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-warning-ink">
                {t("insights.overduePayables")}
              </p>
              <p className="mt-1 text-lg font-bold text-warning-ink">
                <Money value={data.overduePayables.total} symbol={symbol} />
              </p>
              <p className="text-[11px] text-warning-ink">
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
              <p className="mt-0.5 text-[11px] text-warning-ink">
                {t("insights.overduePayablesHint")}
              </p>
            </div>
            <Link
              href="/more/suppliers"
              className="shrink-0 rounded-lg border border-warning/30 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-warning-ink hover:bg-warning-soft"
            >
              {t("insights.viewSuppliers")}
            </Link>
          </div>
        </div>
      ) : null}

      {/* Sales trend */}
      <Section title={t("insights.salesTrend")} icon={<TrendingUp className="h-4 w-4" />}>
        <div className="divide-y divide-line">
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
          <p className="text-sm text-ink-subtle">{t("insights.noTopProducts")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.topProducts.map((p, index) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-muted">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/more/products/${p.id}`} className="truncate text-sm font-medium text-ink">
                    {p.name}
                  </Link>
                  <p className="text-xs text-ink-subtle">
                    {p.quantity} {p.unit}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink">
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
          <p className="text-sm text-ink-subtle">{t("insights.noSlowMovers")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.slowMovers.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/more/products/${p.id}`} className="truncate text-sm font-medium text-ink">
                    {p.name}
                  </Link>
                  <p className="text-xs text-ink-subtle">
                    {p.currentStock} {p.unit}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-ink-faint">{t("insights.stockValue")}</p>
                  <p className="text-sm font-semibold text-ink">
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
          <p className="text-sm text-ink-subtle">{t("insights.noLowStock")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.lowStock.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/more/products/${p.id}`} className="truncate text-sm font-medium text-ink">
                  {p.name}
                </Link>
                <span className="shrink-0 text-xs text-danger-ink">
                  {p.currentStock} {p.unit}
                  <span className="text-ink-faint"> · {t("insights.threshold")}: {p.threshold}</span>
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
          <p className="text-sm text-ink-subtle">{t("insights.noInactiveCustomers")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.inactiveCustomers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/khata/${c.id}`} className="truncate text-sm font-medium text-ink">
                    {c.name}
                  </Link>
                  <p className="text-xs text-ink-subtle">
                    {c.daysInactive === null
                      ? t("insights.neverActive")
                      : `${c.daysInactive} ${t("insights.daysInactive")}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-warning-ink">
                  <Money value={c.balance} symbol={symbol} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="px-1 pb-2 text-center text-[11px] text-ink-faint">
        <Truck className="mr-1 inline h-3 w-3" />
        {t("insights.range")}
      </p>
    </div>
  );
}
