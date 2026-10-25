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
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
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
        isGood ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
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
        <p className="text-xs text-slate-500">{t("reports.subtitle")}</p>
        {data ? (
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            {t("reports.exportCsv")}
          </button>
        ) : null}
      </div>

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
                {Number(data.sales.discounts) > 0 ? (
                  <p className="text-[11px] text-emerald-700">
                    {t("reports.discountsGiven")}{" "}
                    <span className="font-semibold">
                      <Money value={data.sales.discounts} symbol={symbol} />
                    </span>
                  </p>
                ) : null}
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

          {/* ── Previous period comparison ─────────────────────────────── */}
          <Section
            title={t("reports.comparison")}
            hint={tParams("reports.comparisonHint", {
              from: prettyDate(data.comparison.from),
              to: prettyDate(data.comparison.to),
            })}
            icon={<TrendingUp className="h-4 w-4" />}
          >
            <div className="divide-y divide-slate-100">
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
                    <p className="text-sm text-slate-700">{row.label}</p>
                    <p className="text-[11px] text-slate-500">
                      {t("reports.previous")}{" "}
                      <Money value={row.previous} symbol={symbol} />
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
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
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
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

          {/* ── Overdue payables ──────────────────────────────────────── */}
          <Section
            title={t("reports.overduePayables")}
            hint={t("reports.overduePayablesHint")}
            icon={<Truck className="h-4 w-4" />}
          >
            {data.overduePayables.count === 0 ? (
              <p className="text-sm text-slate-500">{t("reports.noOverduePayables")}</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-sm font-bold text-red-800">
                    <Money value={data.overduePayables.total} symbol={symbol} />
                  </p>
                  <p className="text-[11px] font-medium text-red-700">
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
                <ul className="divide-y divide-slate-100">
                  {data.overduePayables.rows.map((row) => (
                    <li
                      key={row.purchaseId}
                      className="flex items-start justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/more/suppliers/${row.supplierId}`}
                          className="block truncate text-sm font-medium text-slate-900 hover:underline"
                        >
                          {row.supplierName}
                        </Link>
                        <p className="text-[11px] text-slate-500">
                          {t("purchase.dueOn")}: {formatDate(row.dueDate)} ·{" "}
                          <span className="font-semibold text-red-600">
                            {countLabel(
                              row.daysOverdue,
                              "reports.daysOverdueOne",
                              "reports.daysOverdue",
                            )}
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-amber-800">
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
                  <p className="mt-2 text-[11px] text-slate-500">
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

          {/* ── Sales by customer ──────────────────────────────────────── */}
          <Section title={t("reports.salesByCustomer")} icon={<Users className="h-4 w-4" />}>
            {data.sales.byCustomer.length === 0 ? (
              <p className="text-sm text-slate-500">{t("reports.noSalesInRange")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.sales.byCustomer.map((customer, index) => (
                  <li key={customer.customerId} className="flex items-center gap-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/khata/${customer.customerId}`}
                        className="block truncate text-sm font-medium text-slate-900 hover:underline"
                      >
                        {customer.name}
                      </Link>
                      <p className="text-[11px] text-slate-500">
                        {countLabel(customer.count, "reports.salesCountOne", "reports.salesCount")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
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
              <p className="text-sm text-slate-500">{t("reports.noPurchasesInRange")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.purchases.bySupplier.map((supplier) => (
                  <li key={supplier.supplierId} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/more/suppliers/${supplier.supplierId}`}
                        className="min-w-0 truncate text-sm font-medium text-slate-900 hover:underline"
                      >
                        {supplier.name}
                      </Link>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                        <Money value={supplier.billed} symbol={symbol} />
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
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
              <p className="text-sm text-slate-500">{t("reports.noPayments")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.collections.byMethod.map((row) => (
                  <li key={row.method} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">
                        {t(`method.${row.method}` as TranslationKey)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {countLabel(row.count, "reports.paymentsCountOne", "reports.paymentsCount")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">
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
                  <h3 className="text-xs font-semibold text-slate-700">
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
                  <p className="text-xs text-slate-500">{t("reports.noCustomerBalances")}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.balances.customers.map((customer) => (
                      <li key={customer.id} className="flex items-center justify-between gap-2 py-1.5">
                        <div className="min-w-0">
                          <Link
                            href={`/khata/${customer.id}`}
                            className="block truncate text-sm text-slate-800 hover:underline"
                          >
                            {customer.name}
                          </Link>
                          {customer.phone ? (
                            <p className="text-[11px] text-slate-500">{customer.phone}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">
                          <Money value={customer.balance} symbol={symbol} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-700">
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
                  <p className="text-xs text-slate-500">{t("reports.noSupplierBalances")}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.balances.suppliers.map((supplier) => (
                      <li key={supplier.id} className="flex items-center justify-between gap-2 py-1.5">
                        <div className="min-w-0">
                          <Link
                            href={`/more/suppliers/${supplier.id}`}
                            className="block truncate text-sm text-slate-800 hover:underline"
                          >
                            {supplier.name}
                          </Link>
                          {supplier.phone ? (
                            <p className="text-[11px] text-slate-500">{supplier.phone}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-700">
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
              <p className="text-sm text-slate-500">{t("reports.noLowStock")}</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {data.lowStock.map((product) => (
                    <li key={product.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <Link
                          href={`/more/products/${product.id}`}
                          className="block truncate text-sm font-medium text-slate-900 hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="text-[11px] text-slate-500">
                          {tParams("reports.threshold", {
                            count: product.lowStockThreshold,
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800">
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

          {/* ── Follow-up outcomes ─────────────────────────────────────── */}
          <Section
            title={t("reports.followUps")}
            icon={<MessageSquare className="h-4 w-4" />}
          >
            <p className="mb-2 text-xs text-slate-500">
              {t("reports.followUpsHint")}
            </p>
            {data.followUps.total === 0 ? (
              <p className="text-sm text-slate-500">{t("reports.noFollowUps")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "orderPlaced", label: "reports.followUp.orderPlaced", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                  { key: "interested", label: "reports.followUp.interested", tone: "text-blue-700 bg-blue-50 border-blue-200" },
                  { key: "contacted", label: "reports.followUp.contacted", tone: "text-slate-700 bg-slate-50 border-slate-200" },
                  { key: "noResponse", label: "reports.followUp.noResponse", tone: "text-amber-700 bg-amber-50 border-amber-200" },
                  { key: "notInterested", label: "reports.followUp.notInterested", tone: "text-rose-700 bg-rose-50 border-rose-200" },
                  { key: "pending", label: "reports.followUp.pending", tone: "text-slate-600 bg-white border-slate-200" },
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
              <p className="mt-2 text-[11px] text-slate-500">
                {tParams("reports.followUpsResolved", {
                  count: data.followUps.resolved,
                })}
              </p>
            ) : null}
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
