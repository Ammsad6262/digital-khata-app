/**
 * Builds a customer's khata statement as plain text, ready to send on
 * WhatsApp.
 *
 * Every figure comes from the customer's own record — the balance, the recent
 * entries and the totals are exactly what the app already shows on screen.
 * Nothing is rounded, estimated or padded, so the owner can send it as-is
 * without checking it first.
 */

import type { CustomerTransaction } from "@/lib/services/customers";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Decimal } from "@/lib/utils/decimal";
import { formatMoney } from "@/lib/utils/money";

type Translator = {
  t: (key: TranslationKey) => string;
  tParams: (key: TranslationKey, params: Record<string, string | number>) => string;
};

export type StatementCustomer = {
  name: string;
  balance: string;
  totalPurchases?: string;
  totalPayments?: string;
};

const TYPE_KEYS: Record<CustomerTransaction["type"], TranslationKey> = {
  sale: "statement.txSale",
  payment: "statement.txPayment",
  adjustment: "statement.txAdjustment",
};

function shortDate(value: Date | string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function buildCustomerStatement(
  customer: StatementCustomer,
  transactions: CustomerTransaction[],
  { t, tParams }: Translator,
  currencySymbol: string,
  options: { maxEntries?: number; businessName?: string | null } = {},
): string {
  const maxEntries = options.maxEntries ?? 5;
  const balance = new Decimal(customer.balance);
  const money = (value: string | number | Decimal) => formatMoney(value, currencySymbol);

  const lines: string[] = [];

  lines.push(tParams("statement.greeting", { name: customer.name }));

  const business = options.businessName?.trim();
  lines.push(
    business
      ? tParams("statement.titleFrom", { business })
      : t("statement.title"),
  );
  lines.push("");

  lines.push(
    balance.gt(0)
      ? tParams("statement.youOwe", { amount: money(balance.toString()) })
      : balance.lt(0)
        ? tParams("statement.advance", { amount: money(balance.abs().toString()) })
        : t("statement.settled"),
  );

  const recent = transactions.slice(-maxEntries).reverse();
  const earlier = transactions.length - recent.length;

  if (recent.length > 0) {
    lines.push("");
    lines.push(t("statement.recent"));
    for (const tx of recent) {
      lines.push(
        `• ${shortDate(tx.date)} — ${t(TYPE_KEYS[tx.type])} — ${money(tx.amount)}`,
      );
    }
    if (earlier > 0) {
      lines.push(tParams("statement.earlier", { count: earlier }));
    }
  }

  // Totals: the same lifetime figures the customer page shows.
  const totals: string[] = [];
  if (customer.totalPurchases && !new Decimal(customer.totalPurchases).isZero()) {
    totals.push(tParams("statement.totalPurchases", { amount: money(customer.totalPurchases) }));
  }
  if (customer.totalPayments && !new Decimal(customer.totalPayments).isZero()) {
    totals.push(tParams("statement.totalPaid", { amount: money(customer.totalPayments) }));
  }
  if (totals.length > 0) {
    lines.push("");
    lines.push(...totals);
  }

  lines.push("");
  lines.push(t("statement.closing"));

  return lines.join("\n");
}
