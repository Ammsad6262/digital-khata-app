/**
 * Plan warnings are produced by the orchestrator as English sentences because
 * they are also useful in logs and tests. The confirmation card shows them to
 * the owner, who may be reading the app in Urdu.
 *
 * This module maps those exact sentences back to translation keys plus
 * parameters, so the card can render them in the UI language. It is deliberately
 * pure (no Next.js, no Prisma) so it can be unit-tested directly, and it degrades
 * gracefully: an unmapped sentence keeps its English `text`.
 */

import type { PlanWarning } from "./types";

type Rule = {
  re: RegExp;
  key: string;
  params?: (match: RegExpMatchArray) => Record<string, string | number>;
};

const RULES: Rule[] = [
  {
    re: /^No customer named [“"](.+?)[”"] yet\./,
    key: "plan.warn.noCustomerNamed",
    params: (m) => ({ name: m[1] ?? "" }),
  },
  { re: /^No customer was mentioned\./, key: "plan.warn.noCustomer" },
  {
    re: /^No product named [“"](.+?)[”"] yet\./,
    key: "plan.warn.noProductNamed",
    params: (m) => ({ name: m[1] ?? "" }),
  },
  { re: /^No product was mentioned\./, key: "plan.warn.noProduct" },
  {
    re: /^No supplier named [“"](.+?)[”"] yet\./,
    key: "plan.warn.noSupplierNamed",
    params: (m) => ({ name: m[1] ?? "" }),
  },
  { re: /^No supplier was mentioned\./, key: "plan.warn.noSupplier" },
  {
    re: /^Paid (.+) is more than the sale total (.+)\.$/,
    key: "plan.warn.overpaid",
    params: (m) => ({ paid: m[1] ?? "", total: m[2] ?? "" }),
  },
  {
    re: /^Only (\S+) (\S+) of (.+) in stock/,
    key: "plan.warn.oversell",
    params: (m) => ({ current: m[1] ?? "", unit: m[2] ?? "", name: m[3] ?? "" }),
  },
  { re: /^This reverses money and inventory\./, key: "plan.warn.void" },
];

/** Reduce English warnings to translated keys, keeping the text as a fallback. */
export function warningKeysFromEnglish(warnings: string[]): PlanWarning[] {
  return warnings.map((text) => {
    for (const rule of RULES) {
      const match = text.match(rule.re);
      if (match) return { key: rule.key, params: rule.params?.(match), text };
    }
    return { key: "", text };
  });
}
