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
  ArrowDown,
  ArrowDownLeft,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  Download,
  MessageSquare,
  Package,
  Receipt,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { Money } from "@/components/shared/Money";
import { useReport, type ReportQuery } from "@/hooks/use-report";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useLanguage } from "@/providers/language-provider";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ReportData, ReportLimitation } from "@/lib/services/reports";
import { ChartFrame, LegendDot } from "@/components/charts/ChartFrame";
import { BarList } from "@/components/charts/BarList";
import { WaterfallChart, type WaterfallStep } from "@/components/charts/WaterfallChart";
import { DumbbellChart, type DumbbellRow } from "@/components/charts/DumbbellChart";
import { compactMoney } from "@/components/charts/format";

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

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function ChangeBadge({
  value,
  goodWhenUp = true,
  noPreviousLabel,
}: {
  value: string | null;
  goodWhenUp?: boolean;
  noPreviousLabel: string;
}) {
  if (value === null) {
    return (
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
        {noPreviousLabel}
      </span>
    );
  }
  const number = Number(value);
  const isUp = number >= 0;
  const isGood = isUp === goodWhenUp;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
        isGood ? "bg-success-soft text-success-ink" : "bg-danger-soft text-danger-ink",
      )}
    >
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(number).toFixed(1)}%
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
      <span className={cn("text-sm", strong ? "font-medium text-ink" : "text-ink-muted")}>
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          strong ? "text-sm font-bold" : "text-sm font-semibold",
          tone === "in" && "text-success-ink",
          tone === "out" && "text-danger-ink",
          tone === "default" && "text-ink",
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
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
      <span className="text-xs leading-relaxed text-warning-ink">{text}</span>
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

  /** The profit arithmetic as explicit steps so the chart cannot disagree with
   *  the profit section below it. */
  const profitFlow = useMemo<WaterfallStep[]>(() => {
    if (!data) return [];
    const revenue = Number(data.profit.revenue) || 0;
    const cogs = Number(data.profit.cogs) || 0;
    const gross = Number(data.profit.grossProfit) || 0;
    const expenses = Number(data.profit.expenses) || 0;
    const net = Number(data.profit.netProfit) || 0;
    return [
      {
        key: "revenue",
        label: t("reports.salesBilled"),
        shortLabel: t("reports.wfRevenue"),
        display: compactMoney(revenue, symbol),
        start: 0,
        end: revenue,
        kind: "total",
      },
      {
        key: "cogs",
        label: t("reports.costOfGoods"),
        shortLabel: t("reports.wfCogs"),
        display: compactMoney(cogs, symbol),
        start: revenue,
        end: revenue - cogs,
        kind: "minus",
      },
      {
        key: "gross",
        label: t("reports.grossProfit"),
        shortLabel: t("reports.wfGross"),
        display: compactMoney(gross, symbol),
        start: 0,
        end: gross,
        kind: "subtotal",
      },
      {
        key: "expenses",
        label: t("reports.expenses"),
        shortLabel: t("reports.wfExpenses"),
        display: compactMoney(expenses, symbol),
        start: gross,
        end: gross - expenses,
        kind: "minus",
      },
      {
        key: "net",
        label: t("reports.netEstimate"),
        shortLabel: t("reports.wfNet"),
        display: compactMoney(net, symbol),
        start: 0,
        end: net,
        kind: "net",
      },
    ];
  }, [data, symbol, t]);

  /** Current vs previous on one shared scale (dumbbell chart). */
  const comparisonRows = useMemo<DumbbellRow[]>(() => {
    if (!data) return [];
    const rows = [
      {
        key: "sales",
        label: t("reports.salesBilled"),
        current: Number(data.sales.billed) || 0,
        previous: Number(data.comparison.salesBilled) || 0,
      },
      {
        key: "cash",
        label: t("reports.cashReceived"),
        current: Number(data.sales.cashReceived) || 0,
        previous: Number(data.comparison.cashReceived) || 0,
      },
      {
        key: "purchases",
        label: t("reports.purchasesBilled"),
        current: Number(data.purchases.billed) || 0,
        previous: Number(data.comparison.purchasesBilled) || 0,
      },
      {
        key: "expenses",
        label: t("reports.expenses"),
        current: Number(data.expenses.total) || 0,
        previous: Number(data.comparison.expenses) || 0,
      },
      {
        key: "net",
        label: t("reports.netEstimate"),
        current: Number(data.profit.netProfit) || 0,
        previous: Number(data.comparison.netProfit) || 0,
      },
    ];
    return rows.map((row) => ({
      ...row,
      currentDisplay: compactMoney(row.current, symbol),
      previousDisplay: compactMoney(row.previous, symbol),
    }));
  }, [data, symbol, t]);

  /**
   * Export the figures currently on screen. The file is built from the same
   * report payload, so it cannot disagree with the UI. No hidden extra query.
   */
  function downloadCsv() {
    if (!data) return;
    const rows: string[][] = [];
    const add = (...cells: Array<string | number | null | undefined>) => {
      rows.push(cells.map(csvCell));
    };

    add("Dukhata report");
    add("From", data.from, "To", data.to, "Timezone", data.timezone);
    add("");
    add("Money in");
    add("Sales billed", data.sales.billed);
    add("Discounts given", data.sales.discounts);
    add("Cash received", data.sales.cashReceived);
    add("Sales count", data.sales.count);
    add("");
    add("Money out");
    add("Purchases billed", data.purchases.billed);
    add("Paid to suppliers", data.purchases.cashPaid);
    add("Expenses", data.expenses.total);
    add("Expense count", data.expenses.count);
    add("");
    add("Profit estimate");
    add("Revenue", data.profit.revenue);
    add("Cost of goods sold", data.profit.cogs);
    add("Gross profit", data.profit.grossProfit);
    add("Expenses", data.profit.expenses);
    add("Net estimate", data.profit.netProfit);
    add("Margin %", data.profit.profitMargin);
    add("");
    add("Position today");
    add("Receivables", data.position.receivables);
    add("Receivable customers", data.position.receivablesCount);
    add("Payables", data.position.payables);
    add("Payable suppliers", data.position.payablesCount);
    add("Stock value", data.position.stockValue);
    add("Stock products", data.position.stockProducts);
    add("Stock not valued", data.position.stockNotValued);
    add("Overdue receivables", data.position.overdue);
    add("");
    add("Overdue payables");
    add("Total overdue", data.overduePayables.total);
    add("Invoices", data.overduePayables.count);
    add("Suppliers", data.overduePayables.suppliersCount);
    for (const row of data.overduePayables.rows) {
      add(
        "Supplier",
        row.supplierName,
        "Invoice",
        row.purchaseId,
        "Due",
        row.dueDate,
        "Days overdue",
        row.daysOverdue,
        "Remaining",
        row.remaining,
      );
    }
    add("");
    add("Compared with previous period", `${data.comparison.from} to ${data.comparison.to}`);
    add("Sales billed (previous)", data.comparison.salesBilled);
    add("Cash received (previous)", data.comparison.cashReceived);
    add("Purchases (previous)", data.comparison.purchasesBilled);
    add("Expenses (previous)", data.comparison.expenses);
    add("Net estimate (previous)", data.comparison.netProfit);
    add("");
    add("Payments by method");
    for (const row of data.collections.byMethod) {
      add(row.method, row.amount, row.count);
    }
    add("");
    add("Customers who owe you");
    for (const row of data.balances.customers) {
      add(row.name, row.phone ?? "", row.balance);
    }
    add("");
    add("Suppliers you owe");
    for (const row of data.balances.suppliers) {
      add(row.name, row.phone ?? "", row.balance);
    }
    add("");
    add("Low stock");
    for (const row of data.lowStock) {
      add(row.name, row.currentStock, row.unit, row.lowStockThreshold);
    }
    add("");
    add("Top products");
    for (const row of data.topProducts) {
      add(row.name, row.quantity, row.unit, row.revenue);
    }
    add("");
    add("Sales by customer");
    for (const row of data.sales.byCustomer) {
      add(row.name, row.billed, row.count);
    }
    add("");
    add("Purchases by supplier");
    for (const row of data.purchases.bySupplier) {
      add(row.name, row.billed, row.paidAtPurchase, row.supplierPayments, row.count);
    }
    add("");
    add("Expenses by category");
    for (const row of data.expenses.byCategory) {
      add(row.category, row.amount, row.count);
    }
    add("");
    add("Follow-up outcomes");
    add("Order placed", data.followUps.orderPlaced);
    add("Interested", data.followUps.interested);
    add("Contacted", data.followUps.contacted);
    add("No response", data.followUps.noResponse);
    add("Not interested", data.followUps.notInterested);
    add("Not contacted yet", data.followUps.pending);
    add("Outcomes recorded", data.followUps.resolved);

    const csv = rows.map((row) => row.join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dukhata-report-${data.from}-to-${data.to}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

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
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs text-ink-subtle">{t("reports.subtitle")}</p>
        {data ? (
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-app"
          >
            <Download className="h-3.5 w-3.5" />
            {t("reports.exportCsv")}
          </button>
        ) : null}
      </div>

      {/* ── Period picker ─────────────────────────────────────────────── */}
      <div className="rounded-card border border-line bg-surface shadow-card p-3.5">
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
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-line bg-surface text-ink-muted hover:bg-app",
                )}
                aria-pressed={active}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <CalendarDays className="h-3.5 w-3.5 text-ink-faint" />
            {t("reports.customRange")}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-[8rem] flex-1">
              <span className="mb-1 block text-[11px] text-ink-subtle">{t("reports.from")}</span>
              <input
                type="date"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="min-w-[8rem] flex-1">
              <span className="mb-1 block text-[11px] text-ink-subtle">{t("reports.to")}</span>
              <input
                type="date"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={applyCustom}
              className="rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-800"
            >
              {t("reports.apply")}
            </button>
          </div>
          {rangeError ? (
            <p className="mt-1.5 text-xs text-danger-ink">{rangeError}</p>
          ) : null}
        </div>

        {data ? (
          <p className="mt-3 text-[11px] text-ink-subtle">
            {tParams("reports.showing", {
              from: prettyDate(data.from),
              to: prettyDate(data.to),
            })}
            {isFetching ? ` · ${t("common.loading")}` : ""}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink-subtle">{t("common.loading")}</p>
      ) : isError || !data ? (
        <div className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-center">
          <p className="text-sm text-danger-ink">{t("reports.error")}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger-ink hover:bg-danger-soft"
          >
            {t("reports.retry")}
          </button>
        </div>
      ) : (
        <>
          {/* ── Money in / out ─────────────────────────────────────────── */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-success/20 bg-success-soft p-3.5">
              <p className="flex items-center gap-1 text-xs font-medium text-success-ink">
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
                <p className="text-[11px] text-success-ink">
                  {countLabel(data.sales.count, "reports.salesCountOne", "reports.salesCount")}
                </p>
                {Number(data.sales.discounts) > 0 ? (
                  <p className="text-[11px] text-success-ink">
                    {t("reports.discountsGiven")}{" "}
                    <span className="font-semibold">
                      <Money value={data.sales.discounts} symbol={symbol} />
                    </span>
                  </p>
                ) : null}
                <div className="mt-1 border-t border-success/20 pt-1.5">
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

            <div className="rounded-xl border border-danger/20 bg-danger-soft p-3.5">
              <p className="flex items-center gap-1 text-xs font-medium text-danger-ink">
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
                <div className="mt-1 border-t border-danger/20 pt-1.5">
                  <Figure
                    label={t("reports.expenses")}
                    value={data.expenses.total}
                    symbol={symbol}
                    tone="out"
                    strong
                  />
                  <p className="text-[11px] text-danger-ink">
                    {countLabel(data.expenses.count, "reports.expenseCountOne", "reports.expenseCount")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Profit flow ─────────────────────────────────────────── */}
          <ChartFrame
            title={t("reports.chartProfitTitle")}
            hint={t("reports.chartProfitHint")}
          >
            {profitFlow.some((step) => Math.abs(step.start) > 0 || Math.abs(step.end) > 0) ? (
              <WaterfallChart steps={profitFlow} />
            ) : (
              <p className="text-sm text-ink-subtle">{t("reports.chartEmpty")}</p>
            )}
          </ChartFrame>

          {/* ── Previous period comparison ─────────────────────────────── */}
          <Section
            title={t("reports.comparison")}
            hint={tParams("reports.comparisonHint", {
              from: prettyDate(data.comparison.from),
              to: prettyDate(data.comparison.to),
            })}
            icon={<TrendingUp className="h-4 w-4" />}
          >
            <div className="mb-3">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-subtle">
                <LegendDot colorVar="--brand-600" label={t("reports.thisPeriod")} />
                <LegendDot colorVar="--ink-faint" label={t("reports.previousPeriod")} hollow />
              </div>
              {comparisonRows.some(
                (row) => Math.abs(row.current) > 0 || Math.abs(row.previous) > 0,
              ) ? (
                <DumbbellChart
                  rows={comparisonRows}
                  previousLabel={t("reports.previousPeriod")}
                />
              ) : (
                <p className="text-sm text-ink-subtle">{t("reports.chartEmpty")}</p>
              )}
            </div>
            <div className="divide-y divide-line">
              {[
                {
                  label: t("reports.salesBilled"),
                  current: data.sales.billed,
                  previous: data.comparison.salesBilled,
                  change: data.comparison.changes.salesPct,
                  goodWhenUp: true,
                },
                {
                  label: t("reports.cashReceived"),
                  current: data.sales.cashReceived,
                  previous: data.comparison.cashReceived,
                  change: data.comparison.changes.cashPct,
                  goodWhenUp: true,
                },
                {
                  label: t("reports.purchasesBilled"),
                  current: data.purchases.billed,
                  previous: data.comparison.purchasesBilled,
                  change: data.comparison.changes.purchasesPct,
                  goodWhenUp: false,
                },
                {
                  label: t("reports.expenses"),
                  current: data.expenses.total,
                  previous: data.comparison.expenses,
                  change: data.comparison.changes.expensesPct,
                  goodWhenUp: false,
                },
                {
                  label: t("reports.netEstimate"),
                  current: data.profit.netProfit,
                  previous: data.comparison.netProfit,
                  change: data.comparison.changes.netProfitPct,
                  goodWhenUp: true,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink-muted">{row.label}</p>
                    <p className="text-[11px] text-ink-subtle">
                      {t("reports.previous")}{" "}
                      <Money value={row.previous} symbol={symbol} />
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      <Money value={row.current} symbol={symbol} />
                    </span>
                    <ChangeBadge
                      value={row.change}
                      goodWhenUp={row.goodWhenUp}
                      noPreviousLabel={t("reports.noPrevious")}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">
              {t("reports.comparisonNote")}
            </p>
          </Section>

          {/* ── Profit estimate ────────────────────────────────────────── */}
          <Section
            title={t("reports.profitEstimate")}
            icon={<TrendingUp className="h-4 w-4" />}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-ink-subtle">{t("reports.netEstimate")}</p>
                <p
                  className={cn(
                    "mt-0.5 text-2xl font-bold tabular-nums",
                    Number(data.profit.netProfit) < 0 ? "text-danger-ink" : "text-success-ink",
                  )}
                >
                  <Money value={data.profit.netProfit} symbol={symbol} />
                </p>
                <p className="mt-0.5 text-[11px] text-ink-subtle">
                  {tParams("reports.margin", { value: data.profit.profitMargin })}
                </p>
              </div>
              <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-ink">
                {t("reports.profitBadge")}
              </span>
            </div>

            <div className="mt-3 divide-y divide-line border-t border-line pt-1">
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
              <div className="rounded-lg border border-success/20 bg-success-soft p-3">
                <p className="text-[11px] font-medium text-success-ink">
                  {t("reports.receivables")}
                </p>
                <p className="mt-0.5 text-base font-bold text-success-ink">
                  <Money value={data.position.receivables} symbol={symbol} />
                </p>
                <p className="text-[11px] text-success-ink">
                  {countLabel(data.position.receivablesCount, "reports.customersCountOne", "reports.customersCount")}
                </p>
              </div>
              <div className="rounded-lg border border-warning/25 bg-warning-soft p-3">
                <p className="text-[11px] font-medium text-warning-ink">
                  {t("reports.payables")}
                </p>
                <p className="mt-0.5 text-base font-bold text-warning-ink">
                  <Money value={data.position.payables} symbol={symbol} />
                </p>
                <p className="text-[11px] text-warning-ink">
                  {countLabel(data.position.payablesCount, "reports.suppliersCountOne", "reports.suppliersCount")}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-app p-3">
                <p className="text-[11px] font-medium text-ink-muted">
                  {t("reports.stockValue")}
                </p>
                <p className="mt-0.5 text-base font-bold text-ink">
                  <Money value={data.position.stockValue} symbol={symbol} />
                </p>
                <p className="text-[11px] text-ink-subtle">
                  {countLabel(data.position.stockProducts, "reports.productsCountOne", "reports.productsCount")}
                </p>
              </div>
            </div>

            {Number(data.position.overdue) > 0 ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-danger-ink">{t("reports.overdue")}</p>
                  <p className="text-sm font-bold text-danger-ink">
                    <Money value={data.position.overdue} symbol={symbol} />
                  </p>
                  <p className="text-[11px] text-danger-ink">
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
                  className="shrink-0 rounded-lg border border-danger/40 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-danger-ink hover:bg-danger-soft"
                >
                  {t("reports.viewSales")}
                </Link>
              </div>
            ) : null}
          </Section>

          {/* ── Overdue payables ──────────────────────────────────────── */}
          <Section
            title={t("reports.overduePayables")}
            hint={t("reports.overduePayablesHint")}
            icon={<Truck className="h-4 w-4" />}
          >
            {data.overduePayables.count === 0 ? (
              <p className="text-sm text-ink-subtle">{t("reports.noOverduePayables")}</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2">
                  <p className="text-sm font-bold text-danger-ink">
                    <Money value={data.overduePayables.total} symbol={symbol} />
                  </p>
                  <p className="text-[11px] font-medium text-danger-ink">
                    {countLabel(
                      data.overduePayables.count,
                      "reports.invoicesCountOne",
                      "reports.invoicesCount",
                    )}{" "}
                    ·{" "}
                    {countLabel(
                      data.overduePayables.suppliersCount,
                      "reports.suppliersCountOne",
                      "reports.suppliersCount",
                    )}
                  </p>
                </div>
                <ul className="divide-y divide-line">
                  {data.overduePayables.rows.map((row) => (
                    <li
                      key={row.purchaseId}
                      className="flex items-start justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/more/suppliers/${row.supplierId}`}
                          className="block truncate text-sm font-medium text-ink hover:underline"
                        >
                          {row.supplierName}
                        </Link>
                        <p className="text-[11px] text-ink-subtle">
                          {t("purchase.dueOn")}: {formatDate(row.dueDate)} ·{" "}
                          <span className="font-semibold text-danger-ink">
                            {countLabel(
                              row.daysOverdue,
                              "reports.daysOverdueOne",
                              "reports.daysOverdue",
                            )}
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-warning-ink">
                          <Money value={row.remaining} symbol={symbol} />
                        </p>
                        <Link
                          href={`/more/suppliers/${row.supplierId}`}
                          className="text-[11px] font-semibold text-brand-700 hover:underline"
                        >
                          {t("reports.paySupplier")}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
                {data.overduePayables.count > data.overduePayables.rows.length ? (
                  <p className="mt-2 text-[11px] text-ink-subtle">
                    {tParams("reports.showingOldest", {
                      shown: data.overduePayables.rows.length,
                      count: data.overduePayables.count,
                    })}
                  </p>
                ) : null}
                <Link
                  href="/more/suppliers"
                  className="mt-2 inline-block text-[11px] font-semibold text-brand-700 hover:underline"
                >
                  {t("reports.viewSuppliers")}
                </Link>
              </>
            )}
          </Section>

          {/* ── Top products ───────────────────────────────────────────── */}
          <Section title={t("reports.topProducts")} icon={<BarChart3 className="h-4 w-4" />}>
            {data.topProducts.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t("reports.noTopProducts")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.topProducts.map((product, index) => (
                  <li key={product.productId} className="flex items-center gap-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-muted">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/more/products/${product.productId}`}
                        className="block truncate text-sm font-medium text-ink"
                      >
                        {product.name}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {product.quantity} {product.unit} {t("reports.sold")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                      <Money value={product.revenue} symbol={symbol} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── Sales by customer ──────────────────────────────────────── */}
          <Section title={t("reports.salesByCustomer")} icon={<Users className="h-4 w-4" />}>
            {data.sales.byCustomer.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t("reports.noSalesInRange")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.sales.byCustomer.map((customer, index) => (
                  <li key={customer.customerId} className="flex items-center gap-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-muted">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/khata/${customer.customerId}`}
                        className="block truncate text-sm font-medium text-ink hover:underline"
                      >
                        {customer.name}
                      </Link>
                      <p className="text-[11px] text-ink-subtle">
                        {countLabel(customer.count, "reports.salesCountOne", "reports.salesCount")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                      <Money value={customer.billed} symbol={symbol} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── Purchases by supplier ──────────────────────────────────── */}
          <Section title={t("reports.purchasesBySupplier")} icon={<Truck className="h-4 w-4" />}>
            {data.purchases.bySupplier.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t("reports.noPurchasesInRange")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.purchases.bySupplier.map((supplier) => (
                  <li key={supplier.supplierId} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/more/suppliers/${supplier.supplierId}`}
                        className="min-w-0 truncate text-sm font-medium text-ink hover:underline"
                      >
                        {supplier.name}
                      </Link>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        <Money value={supplier.billed} symbol={symbol} />
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-subtle">
                      {t("reports.paidAtPurchase")}{" "}
                      <Money value={supplier.paidAtPurchase} symbol={symbol} /> ·{" "}
                      {t("reports.laterPayments")}{" "}
                      <Money value={supplier.supplierPayments} symbol={symbol} /> ·{" "}
                      {countLabel(supplier.count, "reports.purchaseCountOne", "reports.purchaseCount")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── Payments by method ─────────────────────────────────────── */}
          <Section title={t("reports.howPaid")} icon={<CreditCard className="h-4 w-4" />}>
            {data.collections.byMethod.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t("reports.noPayments")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.collections.byMethod.map((row) => (
                  <li key={row.method} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-muted">
                        {t(`method.${row.method}` as TranslationKey)}
                      </p>
                      <p className="text-[11px] text-ink-subtle">
                        {countLabel(row.count, "reports.paymentsCountOne", "reports.paymentsCount")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-success-ink">
                      <Money value={row.amount} symbol={symbol} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── Who owes you / who you owe ─────────────────────────────── */}
          <Section title={t("reports.balances")} icon={<Users className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-ink-muted">
                    {t("reports.customersOwe")}
                  </h3>
                  <Link
                    href="/khata/outstanding"
                    className="text-[11px] font-semibold text-brand-700 hover:underline"
                  >
                    {t("reports.viewAllCustomers")}
                  </Link>
                </div>
                {data.balances.customers.length === 0 ? (
                  <p className="text-xs text-ink-subtle">{t("reports.noCustomerBalances")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.balances.customers.map((customer) => (
                      <li key={customer.id} className="flex items-center justify-between gap-2 py-1.5">
                        <div className="min-w-0">
                          <Link
                            href={`/khata/${customer.id}`}
                            className="block truncate text-sm text-ink hover:underline"
                          >
                            {customer.name}
                          </Link>
                          {customer.phone ? (
                            <p className="text-[11px] text-ink-subtle">{customer.phone}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-success-ink">
                          <Money value={customer.balance} symbol={symbol} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-ink-muted">
                    {t("reports.suppliersOwe")}
                  </h3>
                  <Link
                    href="/more/suppliers"
                    className="text-[11px] font-semibold text-brand-700 hover:underline"
                  >
                    {t("reports.viewAllSuppliers")}
                  </Link>
                </div>
                {data.balances.suppliers.length === 0 ? (
                  <p className="text-xs text-ink-subtle">{t("reports.noSupplierBalances")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.balances.suppliers.map((supplier) => (
                      <li key={supplier.id} className="flex items-center justify-between gap-2 py-1.5">
                        <div className="min-w-0">
                          <Link
                            href={`/more/suppliers/${supplier.id}`}
                            className="block truncate text-sm text-ink hover:underline"
                          >
                            {supplier.name}
                          </Link>
                          {supplier.phone ? (
                            <p className="text-[11px] text-ink-subtle">{supplier.phone}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-warning-ink">
                          <Money value={supplier.balance} symbol={symbol} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          {/* ── Low stock ──────────────────────────────────────────────── */}
          <Section title={t("reports.lowStock")} icon={<Package className="h-4 w-4" />}>
            {data.lowStock.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t("reports.noLowStock")}</p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {data.lowStock.map((product) => (
                    <li key={product.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <Link
                          href={`/more/products/${product.id}`}
                          className="block truncate text-sm font-medium text-ink hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="text-[11px] text-ink-subtle">
                          {tParams("reports.threshold", {
                            count: product.lowStockThreshold,
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-warning/25 bg-warning-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-ink">
                        {product.currentStock} {product.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/more/products"
                  className="mt-2 inline-block text-[11px] font-semibold text-brand-700 hover:underline"
                >
                  {t("reports.viewProducts")}
                </Link>
              </>
            )}
          </Section>

          {/* ── Expenses by category ───────────────────────────────────── */}
          <Section
            title={t("reports.expensesByCategory")}
            icon={<Receipt className="h-4 w-4" />}
          >
            {data.expenses.byCategory.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t("reports.noExpensesInRange")}</p>
            ) : (
              <BarList
                colorVar="--accent-500"
                items={data.expenses.byCategory.map((row) => ({
                  key: row.category,
                  label: row.category,
                  value: Number(row.amount) || 0,
                  display: <Money value={row.amount} symbol={symbol} />,
                  ariaValue: String(row.amount),
                }))}
              />
            )}
          </Section>

          {/* ── Follow-up outcomes ─────────────────────────────────────── */}
          <Section
            title={t("reports.followUps")}
            icon={<MessageSquare className="h-4 w-4" />}
          >
            <p className="mb-2 text-xs text-ink-subtle">
              {t("reports.followUpsHint")}
            </p>
            {data.followUps.total === 0 ? (
              <p className="text-sm text-ink-subtle">{t("reports.noFollowUps")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "orderPlaced", label: "reports.followUp.orderPlaced", tone: "text-success-ink bg-success-soft border-success/20" },
                  { key: "interested", label: "reports.followUp.interested", tone: "text-info-ink bg-info-soft border-info/20" },
                  { key: "contacted", label: "reports.followUp.contacted", tone: "text-ink-muted bg-app border-line" },
                  { key: "noResponse", label: "reports.followUp.noResponse", tone: "text-warning-ink bg-warning-soft border-warning/25" },
                  { key: "notInterested", label: "reports.followUp.notInterested", tone: "text-danger-ink bg-danger-soft border-danger/20" },
                  { key: "pending", label: "reports.followUp.pending", tone: "text-ink-muted bg-surface border-line" },
                ].map((row) => (
                  <div
                    key={row.key}
                    className={`rounded-lg border px-2.5 py-2 ${row.tone}`}
                  >
                    <p className="text-[11px]">{t(row.label as TranslationKey)}</p>
                    <p className="text-base font-bold tabular-nums">
                      {data.followUps[row.key as keyof typeof data.followUps]}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {data.followUps.resolved > 0 ? (
              <p className="mt-2 text-[11px] text-ink-subtle">
                {tParams("reports.followUpsResolved", {
                  count: data.followUps.resolved,
                })}
              </p>
            ) : null}
          </Section>

          {/* ── Limitations ────────────────────────────────────────────── */}
          <section className="rounded-xl border border-warning/25 bg-warning-soft">
            <div className="flex items-start gap-2 border-b border-warning/25 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning-ink" />
              <div>
                <h2 className="text-sm font-semibold text-warning-ink">
                  {t("reports.limitationsTitle")}
                </h2>
                <p className="text-xs text-warning-ink">{t("reports.limitationsHint")}</p>
              </div>
            </div>
            <ul className="divide-y divide-warning/20 px-4 py-2">
              {data.limitations.map((limitation) => (
                <LimitationRow key={limitation.key} limitation={limitation} />
              ))}
            </ul>
          </section>

          <p className="pb-2 text-center text-[11px] text-ink-faint">
            {t("reports.footerNote")}
          </p>
        </>
      )}
    </div>
  );
}
