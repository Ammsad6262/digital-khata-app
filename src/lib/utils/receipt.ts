/**
 * Builds a sale receipt as plain text, ready to send on WhatsApp or copy into
 * any other app.
 *
 * The line maths, the total, what was paid and what is still owed are copied
 * from the saved sale — nothing is recalculated differently here, so the
 * customer sees exactly what the owner sees on screen.
 */

import type { SaleWithItems } from "@/lib/services/sales";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Decimal } from "@/lib/utils/decimal";
import { formatMoney, formatQuantity } from "@/lib/utils/money";

type Translator = {
  t: (key: TranslationKey) => string;
  tParams: (key: TranslationKey, params: Record<string, string | number>) => string;
};

function shortDate(value: Date | string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function buildSaleReceipt(
  sale: SaleWithItems,
  { t, tParams }: Translator,
  currencySymbol: string,
  options: { businessName?: string | null } = {},
): string {
  const money = (value: string | number | Decimal) => formatMoney(value, currencySymbol);
  const total = new Decimal(sale.totalAmount);
  const discount = new Decimal(sale.discountAmount);
  const paid = new Decimal(sale.paidAmount);
  const outstanding = new Decimal(sale.outstanding);

  const lines: string[] = [];

  lines.push(tParams("statement.greeting", { name: sale.customerName }));

  const business = options.businessName?.trim();
  lines.push(
    business ? tParams("receipt.titleFrom", { business }) : t("receipt.title"),
  );
  lines.push(shortDate(sale.date));
  lines.push("");

  sale.items.forEach((item, index) => {
    const qty = formatQuantity(item.quantity, item.productUnit);
    lines.push(
      `${index + 1}. ${item.productName} — ${qty} × ${money(item.unitPrice)} = ${money(item.total)}`,
    );
  });

  lines.push("");
  if (discount.gt(0)) {
    lines.push(
      tParams("receipt.subtotal", { amount: money(total.plus(discount).toString()) }),
    );
    lines.push(tParams("receipt.discount", { amount: money(discount.toString()) }));
  }
  lines.push(tParams("receipt.total", { amount: money(total.toString()) }));
  lines.push(tParams("receipt.paid", { amount: money(paid.toString()) }));

  if (outstanding.gt(0)) {
    lines.push(tParams("receipt.balance", { amount: money(outstanding.toString()) }));
  } else if (paid.gt(total)) {
    // Overpayment is real money received — show it, never hide it.
    lines.push(
      tParams("receipt.change", {
        amount: money(paid.minus(total).toString()),
      }),
    );
  } else {
    lines.push(t("receipt.paidFull"));
  }

  if (sale.notes?.trim()) {
    lines.push("");
    lines.push(sale.notes.trim());
  }

  lines.push("");
  lines.push(t("statement.closing"));

  return lines.join("\n");
}
