"use client";

/**
 * Printable sale receipt.
 *
 * This page exists so the owner never has to screenshot or retype a receipt:
 * it shows the same saved sale in a clean, paper-shaped layout, and the only
 * toolbar (back + print) is hidden when the browser prints. Nothing here is
 * recalculated — every figure comes from the saved sale.
 */

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useSale } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { useLanguage } from "@/providers/language-provider";
import { Decimal } from "@/lib/utils/decimal";
import { formatMoney, formatQuantity } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";

export default function SaleReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, tParams } = useLanguage();
  const { data: sale, isLoading, isError } = useSale(id);
  const { data: settings } = useSettings();

  const symbol = settings?.currencySymbol ?? "Rs.";
  const businessName = settings?.businessName?.trim() || "Dukhata";

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-md p-6 text-sm text-slate-500">
        {t("common.loading")}
      </div>
    );
  }

  if (isError || !sale) {
    return (
      <div className="mx-auto w-full max-w-md space-y-3 p-6">
        <p className="text-sm text-slate-600">{t("sale.notFound")}</p>
        <Link
          href="/sales"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("sale.backToSales")}
        </Link>
      </div>
    );
  }

  const total = new Decimal(sale.totalAmount);
  const discount = new Decimal(sale.discountAmount);
  const paid = new Decimal(sale.paidAmount);
  const outstanding = new Decimal(sale.outstanding);

  return (
    <div className="mx-auto w-full max-w-md bg-slate-50 pb-16 print:max-w-none print:bg-white print:pb-0">
      {/* Toolbar — never printed */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
        <Link
          href={`/sales/${sale.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("receipt.backToSale")}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <Printer className="h-3.5 w-3.5" />
          {t("receipt.printNow")}
        </button>
      </div>

      <p className="px-4 pt-2 text-center text-[11px] text-slate-500 print:hidden">
        {t("receipt.printHint")}
      </p>

      {/* Paper */}
      <article className="mx-4 mt-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:mx-0 print:mt-0 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-slate-200 pb-3 text-center">
          <h1 className="text-lg font-bold text-slate-900">{businessName}</h1>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("receipt.title")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(sale.date)}
          </p>
        </header>

        {sale.voidedAt ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs font-semibold text-red-700">
            {t("receipt.voidedNotice")}
          </p>
        ) : null}

        <div className="mt-3 text-sm">
          <p className="font-semibold text-slate-900">{sale.customerName}</p>
          {sale.customerPhone ? (
            <p className="text-xs text-slate-500">{sale.customerPhone}</p>
          ) : null}
        </div>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="pb-1.5 font-medium">{t("sale.items")}</th>
              <th className="pb-1.5 text-right font-medium">{t("sale.quantity")}</th>
              <th className="pb-1.5 text-right font-medium">{t("sale.total")}</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-2">
                  <p className="font-medium text-slate-900">{item.productName}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatMoney(item.unitPrice, symbol)} / {item.productUnit}
                  </p>
                </td>
                <td className="py-1.5 text-right text-xs tabular-nums text-slate-600">
                  {formatQuantity(item.quantity, item.productUnit)}
                </td>
                <td className="py-1.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {formatMoney(item.total, symbol)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-sm">
          {discount.gt(0) ? (
            <>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t("sale.subtotal")}</span>
                <span className="tabular-nums">
                  {formatMoney(total.plus(discount).toString(), symbol)}
                </span>
              </div>
              <div className="flex justify-between text-xs font-medium text-amber-700">
                <span>{t("sale.discountLabel")}</span>
                <span className="tabular-nums">
                  − {formatMoney(discount.toString(), symbol)}
                </span>
              </div>
            </>
          ) : null}
          <div className="flex justify-between font-bold text-slate-900">
            <span>{t("sale.total")}</span>
            <span className="tabular-nums">{formatMoney(total.toString(), symbol)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>{t("sale.paid")}</span>
            <span className="tabular-nums">{formatMoney(paid.toString(), symbol)}</span>
          </div>
          {outstanding.gt(0) ? (
            <div className="flex justify-between font-semibold text-red-700">
              <span>{t("receipt.balanceLabel")}</span>
              <span className="tabular-nums">
                {formatMoney(outstanding.toString(), symbol)}
              </span>
            </div>
          ) : (
            <p className="text-right text-xs font-medium text-emerald-700">
              {t("receipt.paidFull")}
            </p>
          )}
        </div>

        {sale.dueDate && outstanding.gt(0) ? (
          <p className={cn("mt-2 text-xs", sale.isOverdue ? "font-semibold text-red-700" : "text-slate-500")}>
            {tParams("sale.dueOn", { date: formatDate(sale.dueDate) })}
            {sale.isOverdue ? ` · ${t("sale.overdue")}` : ""}
          </p>
        ) : null}

        {sale.notes ? (
          <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-600">
            {sale.notes}
          </p>
        ) : null}

        <p className="mt-4 border-t border-slate-200 pt-2 text-center text-[11px] text-slate-500">
          {t("receipt.thankYou")}
        </p>
      </article>
    </div>
  );
}
