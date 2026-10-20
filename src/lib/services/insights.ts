/**
 * Business Insights service.
 *
 * HARD RULE: every number here is computed from the user's own records.
 * Nothing is estimated, invented or extrapolated. If there is no data, the
 * insight is simply empty.
 *
 * This is the deterministic evidence layer behind the AI insights/growth UI.
 * An LLM may later narrate these facts, but it must never add numbers.
 */

import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfMonthInTz, startOfWeekInTz } from "@/lib/utils/date";
import { prisma } from "@/lib/db/prisma";
import { listOutstandingCustomers } from "@/lib/services/customers";
import { listProductsWithStock } from "@/lib/services/products";
import { listSuppliersWithBalance } from "@/lib/services/suppliers";

const TZ = "Asia/Karachi";
const RANGE_DAYS = 30;

export type TopProduct = {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  revenue: string;
};

export type SlowMover = {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  stockValue: string;
};

export type LowStockInsight = {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  threshold: number;
};

export type InactiveCustomer = {
  id: string;
  name: string;
  balance: string;
  daysInactive: number | null;
};

export type SalesTrend = {
  thisMonth: string;
  lastMonth: string;
  /** Percent change vs last month, null when last month was zero. */
  changePct: number | null;
  thisWeek: string;
  lastWeek: string;
  weekChangePct: number | null;
};

export type BusinessInsights = {
  generatedAt: string;
  rangeDays: number;
  topProducts: TopProduct[];
  slowMovers: SlowMover[];
  lowStock: LowStockInsight[];
  inactiveCustomers: InactiveCustomer[];
  salesTrend: SalesTrend;
  receivables: { total: string; customersCount: number };
  payables: { total: string; suppliersCount: number };
};

function pctChange(current: Decimal, previous: Decimal): number | null {
  if (previous.isZero()) return null;
  return Number(current.minus(previous).div(previous).times(100).toFixed(1));
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

export async function getBusinessInsights(
  userId: string,
): Promise<BusinessInsights> {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - RANGE_DAYS * 86_400_000);

  const monthStart = startOfMonthInTz(TZ);
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);

  const weekStart = startOfWeekInTz(TZ);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);

  // ── Sales by product over the last 30 days ──────────────────────────────
  const soldGroups = await prisma.saleItem.groupBy({
    by: ["productId"],
    _sum: { quantity: true, total: true },
    where: {
      sale: { userId, voidedAt: null, date: { gte: rangeStart } },
    },
  });

  const soldIds = new Set(soldGroups.map((g) => g.productId));

  const products = await listProductsWithStock(userId);
  const productMap = new Map(products.map((p) => [p.id, p]));

  const topProducts: TopProduct[] = soldGroups
    .map((g) => {
      const product = productMap.get(g.productId);
      return {
        id: g.productId,
        name: product?.name ?? "—",
        unit: product?.unit ?? "",
        quantity: toDecimalOrZero(g._sum.quantity).toString(),
        revenue: toDecimalOrZero(g._sum.total).toString(),
      };
    })
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .slice(0, 5);

  // ── Slow movers: in stock, but no sales in the range ────────────────────
  const slowMovers: SlowMover[] = products
    .filter((p) => !soldIds.has(p.id) && toDecimalOrZero(p.currentStock).greaterThan(0))
    .map((p) => {
      const stock = toDecimalOrZero(p.currentStock);
      const value = stock.times(toDecimalOrZero(p.purchasePrice));
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        currentStock: stock.toString(),
        stockValue: value.toString(),
      };
    })
    .sort((a, b) => Number(b.stockValue) - Number(a.stockValue))
    .slice(0, 5);

  // ── Low stock ───────────────────────────────────────────────────────────
  const lowStock: LowStockInsight[] = products
    .filter((p) => p.isLowStock)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock,
      threshold: p.lowStockThreshold,
    }))
    .slice(0, 5);

  // ── Sales trend (month + week, active sales only) ───────────────────────
  const [thisMonthAgg, lastMonthAgg, thisWeekAgg, lastWeekAgg] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { userId, voidedAt: null, date: { gte: monthStart } },
    }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { userId, voidedAt: null, date: { gte: lastMonthStart, lt: monthStart } },
    }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { userId, voidedAt: null, date: { gte: weekStart } },
    }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { userId, voidedAt: null, date: { gte: lastWeekStart, lt: weekStart } },
    }),
  ]);

  const thisMonth = toDecimalOrZero(thisMonthAgg._sum.totalAmount);
  const lastMonth = toDecimalOrZero(lastMonthAgg._sum.totalAmount);
  const thisWeek = toDecimalOrZero(thisWeekAgg._sum.totalAmount);
  const lastWeek = toDecimalOrZero(lastWeekAgg._sum.totalAmount);

  const salesTrend: SalesTrend = {
    thisMonth: thisMonth.toString(),
    lastMonth: lastMonth.toString(),
    changePct: pctChange(thisMonth, lastMonth),
    thisWeek: thisWeek.toString(),
    lastWeek: lastWeek.toString(),
    weekChangePct: pctChange(thisWeek, lastWeek),
  };

  // ── Receivables ─────────────────────────────────────────────────────────
  const outstanding = await listOutstandingCustomers(userId);
  const receivablesTotal = outstanding.reduce(
    (sum, c) => sum.plus(toDecimalOrZero(c.balance)),
    new Decimal(0),
  );

  // ── Payables ────────────────────────────────────────────────────────────
  const suppliers = await listSuppliersWithBalance(userId);
  const payableSuppliers = suppliers.filter((s) => toDecimalOrZero(s.balance).greaterThan(0));
  const payablesTotal = payableSuppliers.reduce(
    (sum, s) => sum.plus(toDecimalOrZero(s.balance)),
    new Decimal(0),
  );

  // ── Inactive customers who still owe money ──────────────────────────────
  const inactiveCustomers: InactiveCustomer[] = outstanding
    .filter((c) => {
      if (!c.lastActivityAt) return true;
      return c.lastActivityAt.getTime() < rangeStart.getTime();
    })
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      balance: c.balance,
      daysInactive: c.lastActivityAt ? daysBetween(c.lastActivityAt, now) : null,
    }));

  return {
    generatedAt: now.toISOString(),
    rangeDays: RANGE_DAYS,
    topProducts,
    slowMovers,
    lowStock,
    inactiveCustomers,
    salesTrend,
    receivables: {
      total: receivablesTotal.toString(),
      customersCount: outstanding.length,
    },
    payables: {
      total: payablesTotal.toString(),
      suppliersCount: payableSuppliers.length,
    },
  };
}
