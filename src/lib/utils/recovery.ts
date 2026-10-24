/**
 * Builds a payment-recovery message from the real balance only.
 *
 * The amount, invoice count and due date all come from the recovery service.
 * The message never invents a discount, a deadline, or a promise, and it is
 * always editable before the owner sends it.
 */

import type { TranslationKey } from "@/lib/i18n/translations";
import type { RecoveryCandidate } from "@/lib/services/recovery";
import { formatMoney } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";

type Translator = {
  t: (key: TranslationKey) => string;
  tParams: (key: TranslationKey, params: Record<string, string | number>) => string;
};

export function buildRecoveryMessage(
  candidate: RecoveryCandidate,
  { t, tParams }: Translator,
  currencySymbol: string,
  options: { businessName?: string | null } = {},
): string {
  const amount = formatMoney(candidate.outstanding, currencySymbol);
  const invoices =
    candidate.openSales > 1
      ? tParams("recovery.msgInvoices", { count: candidate.openSales })
      : "";
  const due =
    candidate.daysOverdue > 0
      ? tParams("recovery.msgOverdue", { days: candidate.daysOverdue })
      : candidate.oldestDueDate
        ? tParams("recovery.msgDue", { date: formatDate(candidate.oldestDueDate) })
        : "";

  const lines = [
    tParams("recovery.msgGreeting", { name: candidate.customerName }),
    "",
    tParams("recovery.msgBody", { amount, invoices, due }),
    "",
    t("recovery.msgFooter"),
  ];

  const business = options.businessName?.trim();
  if (business) {
    lines.push("", `— ${business}`);
  }

  return lines.join("\n");
}
