/**
 * Growth Assistant — deterministic recommendation engine.
 *
 * HARD RULES:
 *   - Every recommendation is derived from the user's own records.
 *   - No forecasting, no invented amounts, no "projected profit".
 *   - Revenue is only ever labelled revenue. Profit is never computed here.
 *   - If there is no evidence, there is no recommendation.
 *
 * The AI layer (see /api/growth/summary) may only re-word these facts.
 * It is never allowed to produce a number that is not in this payload.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { getBusinessInsights } from "@/lib/services/insights";
import { listOutstandingCustomers } from "@/lib/services/customers";
import { listProductsWithStock } from "@/lib/services/products";
import { listSuppliersWithBalance } from "@/lib/services/suppliers";

const RANGE_DAYS = 30;

export type GrowthPriority = "high" | "medium" | "low";

export type GrowthActionType =
  | "collect_receivables"
  | "restock"
  | "clear_dead_stock"
  | "reengage_customer"
  | "promote_product"
  | "supplier_payment";

export type GrowthRecommendation = {
  /** Stable id, e.g. "collect:<customerId>". */
  id: string;
  type: GrowthActionType;
  priority: GrowthPriority;
  /** What to do — no numbers in the title. */
  title: string;
  /** Why — percentages/days only; money is rendered separately. */
  reason: string;
  /** Raw decimal string rendered by the UI with the business's currency. */
  amount: string | null;
  /** i18n key describing what the amount means. */
  amountLabel:
    | "growth.amount.outstanding"
    | "growth.amount.stockValue"
    | "growth.amount.revenue30d"
    | "growth.amount.payable"
    | null;
  href: string;
};

export type GrowthPlan = {
  generatedAt: string;
  rangeDays: number;
  summary: string;
  recommendations: GrowthRecommendation[];
  totals: {
    receivables: string;
    payables: string;
    deadStockValue: string;
  };
};

const PRIORITY_RANK: Record<GrowthPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function pct(part: Decimal, whole: Decimal): number {
  if (whole.isZero()) return 0;
  return Number(part.div(whole).times(100).toFixed(0));
}

export async function getGrowthPlan(userId: string): Promise<GrowthPlan> {
  const insights = await getBusinessInsights(userId);
  const recommendations: GrowthRecommendation[] = [];

  const receivablesTotal = toDecimalOrZero(insights.receivables.total);
  const payablesTotal = toDecimalOrZero(insights.payables.total);

  // ── 1. Collections: the biggest balances first ───────────────────────────
  const outstanding = await listOutstandingCustomers(userId);
  const topDebtors = [...outstanding]
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 3);

  for (const customer of topDebtors) {
    const balance = toDecimalOrZero(customer.balance);
    if (!balance.greaterThan(0)) continue;

    const share = pct(balance, receivablesTotal);
    const idleDays = customer.lastActivityAt ? daysSince(customer.lastActivityAt) : null;
    const isHigh = share >= 25 || (idleDays !== null && idleDays >= 30);

    recommendations.push({
      id: `collect:${customer.id}`,
      type: "collect_receivables",
      priority: isHigh ? "high" : "medium",
      title: `Collect payment from ${customer.name}`,
      reason:
        share > 0
          ? `${share}% of all receivables${idleDays !== null ? ` · no activity for ${idleDays} days` : ""}.`
          : `Outstanding balance${idleDays !== null ? ` · no activity for ${idleDays} days` : ""}.`,
      amount: balance.toString(),
      amountLabel: "growth.amount.outstanding",
      href: `/khata/${customer.id}`,
    });
  }

  // ── 2. Re-engage customers who owe money but went quiet ──────────────────
  for (const customer of insights.inactiveCustomers) {
    if (topDebtors.some((c) => c.id === customer.id)) continue;
    recommendations.push({
      id: `reengage:${customer.id}`,
      type: "reengage_customer",
      priority: "medium",
      title: `Re-engage ${customer.name}`,
      reason:
        customer.daysInactive === null
          ? "Has a balance but no recorded activity yet."
          : `No purchases for ${customer.daysInactive} days and still owes money.`,
      amount: customer.balance,
      amountLabel: "growth.amount.outstanding",
      href: `/khata/${customer.id}`,
    });
  }

  // ── 3. Restock: low stock that is actually selling ───────────────────────
  if (insights.lowStock.length > 0) {
    const since = new Date(Date.now() - RANGE_DAYS * 86_400_000);
    const lowIds = insights.lowStock.map((p) => p.id);

    const soldGroups = await prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      where: {
        productId: { in: lowIds },
        sale: { userId, voidedAt: null, date: { gte: since } },
      },
    });
    const soldMap = new Map(
      soldGroups.map((g) => [g.productId, toDecimalOrZero(g._sum.quantity)]),
    );

    for (const product of insights.lowStock) {
      const sold = soldMap.get(product.id) ?? new Decimal(0);
      if (!sold.greaterThan(0)) continue; // not selling → don't push a restock

      recommendations.push({
        id: `restock:${product.id}`,
        type: "restock",
        priority: Number(sold) >= 10 ? "high" : "medium",
        title: `Restock ${product.name}`,
        reason: `${sold.toString()} ${product.unit} sold in ${RANGE_DAYS} days · only ${product.currentStock} ${product.unit} left.`,
        amount: null,
        amountLabel: null,
        href: `/more/products/${product.id}`,
      });
    }
  }

  // ── 4. Dead stock: money tied up with no sales ───────────────────────────
  let deadStockValue = new Decimal(0);
  for (const mover of insights.slowMovers) {
    const value = toDecimalOrZero(mover.stockValue);
    deadStockValue = deadStockValue.plus(value);
    recommendations.push({
      id: `dead:${mover.id}`,
      type: "clear_dead_stock",
      priority: value.greaterThanOrEqualTo(5000) ? "medium" : "low",
      title: `Clear dead stock: ${mover.name}`,
      reason: `No sales in ${RANGE_DAYS} days · ${mover.currentStock} ${mover.unit} sitting in stock.`,
      amount: value.toString(),
      amountLabel: "growth.amount.stockValue",
      href: `/more/products/${mover.id}`,
    });
  }

  // ── 5. Promote the products that already earn ────────────────────────────
  for (const product of insights.topProducts.slice(0, 2)) {
    const revenue = toDecimalOrZero(product.revenue);
    if (!revenue.greaterThan(0)) continue;

    recommendations.push({
      id: `promote:${product.id}`,
      type: "promote_product",
      priority: "low",
      title: `Push ${product.name} to more customers`,
      reason: `Top seller: ${product.quantity} ${product.unit} sold in ${RANGE_DAYS} days.`,
      amount: revenue.toString(),
      amountLabel: "growth.amount.revenue30d",
      href: `/more/products/${product.id}`,
    });
  }

  // ── 6. Supplier payables worth planning for ──────────────────────────────
  const suppliers = await listSuppliersWithBalance(userId);
  const topPayable = [...suppliers]
    .filter((s) => toDecimalOrZero(s.balance).greaterThan(0))
    .sort((a, b) => Number(b.balance) - Number(a.balance))[0];

  if (topPayable) {
    recommendations.push({
      id: `pay:${topPayable.id}`,
      type: "supplier_payment",
      priority: "low",
      title: `Plan a payment to ${topPayable.name}`,
      reason: `Largest supplier balance${payablesTotal.greaterThan(0) ? " on record" : ""}.`,
      amount: topPayable.balance,
      amountLabel: "growth.amount.payable",
      href: `/more/suppliers/${topPayable.id}`,
    });
  }

  // Highest priority first, then largest amount.
  recommendations.sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return Number(b.amount ?? 0) - Number(a.amount ?? 0);
  });

  const highCount = recommendations.filter((r) => r.priority === "high").length;
  const summary =
    recommendations.length === 0
      ? "No actions yet — record a few sales, purchases and payments first. Recommendations only appear when your own records support them."
      : highCount > 0
        ? `${highCount} high-priority action${highCount === 1 ? "" : "s"} across ${recommendations.length} total. Start with collections, then restock what is selling.`
        : `${recommendations.length} improvement${recommendations.length === 1 ? "" : "s"} found in the last ${RANGE_DAYS} days.`;

  return {
    generatedAt: new Date().toISOString(),
    rangeDays: RANGE_DAYS,
    summary,
    recommendations,
    totals: {
      receivables: receivablesTotal.toString(),
      payables: payablesTotal.toString(),
      deadStockValue: deadStockValue.toString(),
    },
  };
}

/**
 * Build the fact sheet handed to the AI narrator. Contains only numbers
 * that already exist in the plan — the narrator is validated against it.
 */
export function growthFactsForNarration(plan: GrowthPlan): string {
  return JSON.stringify(
    {
      rangeDays: plan.rangeDays,
      totals: plan.totals,
      summary: plan.summary,
      recommendations: plan.recommendations.map((r) => ({
        type: r.type,
        priority: r.priority,
        title: r.title,
        reason: r.reason,
        amount: r.amount,
        amountLabel: r.amountLabel,
      })),
    },
    null,
    2,
  );
}
