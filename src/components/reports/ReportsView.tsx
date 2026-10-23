"use client";

/**
 * ReportsView — the owner's financial picture for any period.
 *
 * Three rules this screen follows:
 *   1. Never call revenue "profit". Sales, cash and profit are separate rows.
 *   2. Always show the cost basis and the limitations next to the profit
 *      figure, so an incomplete record cannot look like a complete one.
 *   3. Point-in-time numbers (receivables, payables, stock) are labelled
 *      "today", not "for this period".
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Money } from "@/components/shared/Money";
import { useReport, type ReportQuery } from "@/hooks/use-report";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useLanguage } from "@/providers/language-provider";
import { cn } from "@/lib/utils/cn";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ReportData, ReportLimitation } from "@/lib/services/reports";

const PRESETS: Array<{ preset: string; labelKey: TranslationKey }> = [
  { preset: "today", labelKey: "reports.preset.today" },
  { preset: "week", labelKey: "reports.preset.week" },
  { preset: "month", labelKey: "reports.preset.month" },
  { preset: "lastMonth", labelKey: "reports.preset.lastMonth" },
  { preset: "last7", labelKey: "reports.preset.last7" },
  { preset: "last30", labelKey: "reports.preset.last30" },
];

function prettyDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function Figure({
  label,
  value,
  symbol,
  tone = "default",
  negative = false,
  strong = false,
}: {
  label: string;
  value: string;
  symbol: string;
  tone?: "default" | "in" | "out";
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={cn("text-sm", strong ? "font-medium text-slate-800" : "text-slate-600")}>
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          strong ? "text-sm font-bold" : "text-sm font-semibold",
          tone === "in" && "text-emerald-700",
          tone === "out" && "text-rose-600",
          tone === "default" && "text-slate-900",
        )}
      >
        {negative ? "− " : ""}
        <Money value={value} symbol={symbol} />
      </span>
    </div>
  );
}

function LimitationRow({ limitation }: { limitation: ReportLimitation }) {
  const { t, tParams } = useLanguage();
  const key = limitation.key as TranslationKey;
  const text = limitation.params ? tParams(key, limitation.params) : t(key);
  return (
    <li className="flex gap-2 py-1.5">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="text-xs leading-relaxed text-amber-900">{text}</span>
    </li>
  );
}

export function ReportsView() {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();

  const [query, setQuery] = useState<ReportQuery>({ kind: "preset", preset: "month" });
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useReport(query);

  const activePreset = query.kind === "preset" ? query.preset : null;

  const countLabel = (
    count: number,
    one: TranslationKey,
    many: TranslationKey,
  ): string => tParams(count === 1 ? one : many, { count });

  const expenseTotalForBars = useMemo(() => {
    if (!data) return 0;
    return Number(data.expenses.total) || 0;
  }, [data]);

  function choosePreset(preset: string) {
    setRangeError(null);
    setQuery({ kind: "preset", preset });
  }

  function applyCustom() {
    if (!draftFrom || !draftTo) {
      setRangeError(t("reports.invalidRange"));
      return;
    }
    if (draftFrom > draftTo) {
      setRangeError(t("reports.invalidRange"));
      return;
    }
    setRangeError(null);
    setQuery({ kind: "custom", from: draftFrom, to: draftTo });
  }

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-slate-500">{t("reports.subtitle")}</p>

      {/* ── Period picker ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((item) => {
            const active = activePreset === item.preset;
            return (
              <button
                key={item.preset}
                type="button"
                onClick={() => choosePreset(item.preset)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
                aria-pressed={active}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            {t("reports.customRange")}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-[8rem] flex-1">
              <span className="mb-1 block text-[11px] text-slate-500">{t("reports.from")}</span>
              <input
                type="date"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <label className="min-w-[8rem] flex-1">
              <span className="mb-1 block text-[11px] text-slate-500">{t("reports.to")}</span>
              <input
                type="date"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={applyCustom}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {t("reports.apply")}
            </button>
          </div>
          {rangeError ? (
            <p className="mt-1.5 text-xs text-red-600">{rangeError}</p>
          ) : null}
        </div>

        {data ? (
          <p className="mt-3 text-[11px] text-slate-500">
            {tParams("reports.showing", {
              from: prettyDate(data.from),
              to: prettyDate(data.to),
            })}
            {isFetching ? ` · ${t("common.loading")}` : ""}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>
      ) : isError || !data ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm text-red-700">{t("reports.error")}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            {t("reports.retry")}
          </button>
        </div>
      ) : (
        <>
          {/* ── Money in / out ─────────────────────────────────────────── */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
              <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                <ArrowDownLeft className="h-3.5 w-3.5" />
                {t("reports.moneyIn")}
              </p>
              <div className="mt-2 space-y-0.5">
                <Figure
                  label={t("reports.salesBilled")}
                  value={data.sales.billed}
                  symbol={symbol}
                  tone="in"
                />
                <p className="text-[11px] text-emerald-700">
                  {countLabel(data.sales.count, "reports.salesCountOne", "reports.salesCount")}
                </p>
                <div className="mt-1 border-t border-emerald-200 pt-1.5">
                  <Figure
                    label={t("reports.cashReceived")}
                    value={data.sales.cashReceived}
                    symbol={symbol}
                    tone="in"
                    strong
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5">
              <p className="flex items-center gap-1 text-xs font-medium text-rose-700">
                <ArrowUpRight className="h-3.5 w-3.5" />
                {t("reports.moneyOut")}
              </p>
              <div className="mt-2 space-y-0.5">
                <Figure
                  label={t("reports.purchasesBilled")}
                  value={data.purchases.billed}
                  symbol={symbol}
                  tone="out"
                />
                <Figure
                  label={t("reports.cashPaidSuppliers")}
                  value={data.purchases.cashPaid}
                  symbol={symbol}
                  tone="out"
                />
                <div className="mt-1 border-t border-rose-200 pt-1.5">
                  <Figure
                    label={t("reports.expenses")}
                    value={data.expenses.total}
                    symbol={symbol}
                    tone="out"
                    strong
                  />
                  <p className="text-[11px] text-rose-700">
                    {countLabel(data.expenses.count, "reports.expenseCountOne", "reports.expenseCount")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Profit estimate ────────────────────────────────────────── */}
          <Section
            title={t("reports.profitEstimate")}
            icon={<TrendingUp className="h-4 w-4" />}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">{t("reports.netEstimate")}</p>
                <p
                  className={cn(
                    "mt-0.5 text-2xl font-bold tabular-nums",
                    Number(data.profit.netProfit) < 0 ? "text-rose-600" : "text-emerald-700",
                  )}
                >
                  <Money value={data.profit.netProfit} symbol={symbol} />
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {tParams("reports.margin", { value: data.profit.profitMargin })}
                </p>
              </div>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                {t("reports.profitBadge")}
              </span>
            </div>

            <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-1">
              <Figure label={t("reports.salesBilled")} value={data.profit.revenue} symbol={symbol} />
              <Figure
                label={t("reports.costOfGoods")}
                value={data.profit.cogs}
                symbol={symbol}
                negative
                tone="out"
              />
              <Figure
                label={t("reports.grossProfit")}
                value={data.profit.grossProfit}
                symbol={symbol}
                strong
              />
              <Figure
                label={t("reports.expenses")}
                value={data.profit.expenses}
                symbol={symbol}
                negative
                tone="out"
              />
              <Figure
                label={t("reports.netEstimate")}
                value={data.profit.netProfit}
                symbol={symbol}
                strong
              />
            </div>
          </Section>

          {/* ── Position today ─────────────────────────────────────────── */}
          <Section
            title={t("reports.positionToday")}
            icon={<Wallet className="h-4 w-4" />}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-medium text-emerald-700">
                  {t("reports.receivables")}
                </p>
                <p className="mt-0.5 text-base font-bold text-emerald-800">
                  <Money value={data.position.receivables} symbol={symbol} />
                </p>
                <p className="text-[11px] text-emerald-700">
                  {countLabel(data.position.receivablesCount, "reports.customersCountOne", "reports.customersCount")}
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-[11px] font-medium text-amber-700">
                  {t("reports.payables")}
                </p>
                <p className="mt-0.5 text-base font-bold text-amber-800">
                  <Money value={data.position.payables} symbol={symbol} />
                </p>
                <p className="text-[11px] text-amber-700">
                  {countLabel(data.position.payablesCount, "reports.suppliersCountOne", "reports.suppliersCount")}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-600">
                  {t("reports.stockValue")}
                </p>
                <p className="mt-0.5 text-base font-bold text-slate-900">
                  <Money value={data.position.stockValue} symbol={symbol} />
                </p>
                <p className="text-[11px] text-slate-500">
                  {countLabel(data.position.stockProducts, "reports.productsCountOne", "reports.productsCount")}
                </p>
              </div>
            </div>

            {Number(data.position.overdue) > 0 ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-red-700">{t("reports.overdue")}</p>
                  <p className="text-sm font-bold text-red-800">
                    <Money value={data.position.overdue} symbol={symbol} />
                  </p>
                  <p className="text-[11px] text-red-700">
                    {countLabel(
                      data.position.overdueSalesCount,
                      "reports.overdueSalesOne",
                      "reports.overdueSales",
                    )}{" "}
                    ·{" "}
                    {countLabel(
                      data.position.overdueCustomersCount,
                      "reports.customersCountOne",
                      "reports.customersCount",
                    )}
                  </p>
                </div>
                <Link
                  href="/sales"
                  className="shrink-0 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                >
                  {t("reports.viewSales")}
                </Link>
              </div>
            ) : null}
          </Section>

          {/* ── Top products ───────────────────────────────────────────── */}
          <Section title={t("reports.topProducts")} icon={<BarChart3 className="h-4 w-4" />}>
            {data.topProducts.length === 0 ? (
              <p className="text-sm text-slate-500">{t("reports.noTopProducts")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.topProducts.map((product, index) => (
                  <li key={product.productId} className="flex items-center gap-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/more/products/${product.productId}`}
                        className="block truncate text-sm font-medium text-slate-900"
                      >
                        {product.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {product.quantity} {product.unit} {t("reports.sold")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                      <Money value={product.revenue} symbol={symbol} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── Expenses by category ───────────────────────────────────── */}
          <Section
            title={t("reports.expensesByCategory")}
            icon={<Receipt className="h-4 w-4" />}
          >
            {data.expenses.byCategory.length === 0 ? (
              <p className="text-sm text-slate-500">{t("reports.noExpensesInRange")}</p>
            ) : (
              <ul className="space-y-2.5">
                {data.expenses.byCategory.map((row) => {
                  const pct =
                    expenseTotalForBars > 0
                      ? Math.min(100, Math.round((Number(row.amount) / expenseTotalForBars) * 100))
                      : 0;
                  return (
                    <li key={row.category}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm capitalize text-slate-700">{row.category}</span>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          <Money value={row.amount} symbol={symbol} />
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-rose-400"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* ── Limitations ────────────────────────────────────────────── */}
          <section className="rounded-xl border border-amber-200 bg-amber-50">
            <div className="flex items-start gap-2 border-b border-amber-200 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div>
                <h2 className="text-sm font-semibold text-amber-900">
                  {t("reports.limitationsTitle")}
                </h2>
                <p className="text-xs text-amber-700">{t("reports.limitationsHint")}</p>
              </div>
            </div>
            <ul className="divide-y divide-amber-100 px-4 py-2">
              {data.limitations.map((limitation) => (
                <LimitationRow key={limitation.key} limitation={limitation} />
              ))}
            </ul>
          </section>

          <p className="pb-2 text-center text-[11px] text-slate-400">
            {t("reports.footerNote")}
          </p>
        </>
      )}
    </div>
  );
}
