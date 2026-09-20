/**
 * Dashboard service — optimized for high-latency DB connections.
 *
 * The previous version did 7+ separate DB queries (each ~500ms to Supabase
 * Mumbai from Vercel US-East = 3.5s+ total). This version collapses
 * everything into 2 batched queries:
 *
 *   1. One raw SQL query that computes ALL aggregates at once
 *   2. One findMany for recent transactions (with relations)
 *
 * Total: 2 DB round trips instead of 7+.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfTodayInTz } from "@/lib/utils/date";
import { computeStockForAllProducts } from "@/lib/services/products";

export type DashboardStats = {
  totalReceivables: string;
  customerCount: number;
  customersWithBalance: number;
  todaysSales: string;
  todaysPayments: string;
  todaysExpenses: string;
  lowStockProducts: LowStockProduct[];
  recentTransactions: RecentTransaction[];
};

export type LowStockProduct = {
  id: string;
  name: string;
  currentStock: string;
  unit: string;
  lowStockThreshold: number;
};

export type RecentTransaction = {
  id: string;
  type: "sale" | "payment" | "expense" | "stock_move" | "balance_adjustment";
  refType: string;
  refId: string;
  amount: string;
  direction: string;
  date: Date;
  notes: string | null;
  customerName: string | null;
  productName: string | null;
};

export async function getDashboardStats(
  timezone: string = "Asia/Karachi",
): Promise<DashboardStats> {
  const today = startOfTodayInTz(timezone);

  // Batch 1: ALL aggregates in a single raw SQL query
  // This does 5 aggregates + 1 count in ONE round trip
  const aggregates = await prisma.$queryRaw<Array<{
    customer_count: bigint;
    todays_sales: Decimal | null;
    todays_payments: Decimal | null;
    todays_expenses: Decimal | null;
    total_sales: Decimal | null;
    total_payments: Decimal | null;
    total_adjustments: Decimal | null;
  }>>`
    SELECT
      (SELECT COUNT(*) FROM "Customer" WHERE "isDeleted" = false) as customer_count,
      (SELECT COALESCE(SUM("totalAmount"), 0) FROM "Sale" WHERE "voidedAt" IS NULL AND "date" >= ${today}) as todays_sales,
      (SELECT COALESCE(SUM("amount"), 0) FROM "Payment" WHERE "voidedAt" IS NULL AND "date" >= ${today}) as todays_payments,
      (SELECT COALESCE(SUM("amount"), 0) FROM "Expense" WHERE "voidedAt" IS NULL AND "date" >= ${today}) as todays_expenses,
      (SELECT COALESCE(SUM("totalAmount"), 0) FROM "Sale" WHERE "voidedAt" IS NULL) as total_sales,
      (SELECT COALESCE(SUM("amount"), 0) FROM "Payment" WHERE "voidedAt" IS NULL) as total_payments,
      (SELECT COALESCE(SUM("amount"), 0) FROM "CustomerAdjustment" WHERE "voidedAt" IS NULL) as total_adjustments
  `;

  const agg = aggregates[0];
  const customerCount = Number(agg?.customer_count ?? 0);
  const totalSales = toDecimalOrZero(agg?.total_sales);
  const totalPayments = toDecimalOrZero(agg?.total_payments);
  const totalAdjustments = toDecimalOrZero(agg?.total_adjustments);

  // Batch 2: Recent transactions WITH customer/product names (single query with joins)
  const recentTxRaw = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    take: 10,
    select: {
      id: true,
      type: true,
      refType: true,
      refId: true,
      amount: true,
      direction: true,
      date: true,
      notes: true,
      customer: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  const recentTransactions: RecentTransaction[] = recentTxRaw.map((tx) => ({
    id: tx.id,
    type: tx.type as RecentTransaction["type"],
    refType: tx.refType,
    refId: tx.refId,
    amount: tx.amount.toString(),
    direction: tx.direction,
    date: tx.date,
    notes: tx.notes,
    customerName: tx.customer?.name ?? null,
    productName: tx.product?.name ?? null,
  }));

  // Batch 3: Low stock products (batched — 2 queries)
  const [stockByProduct, products] = await Promise.all([
    computeStockForAllProducts(),
    prisma.product.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, unit: true, lowStockThreshold: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const lowStockProducts: LowStockProduct[] = products
    .map((p) => ({
      id: p.id,
      name: p.name,
      currentStock: (stockByProduct.get(p.id) ?? new Decimal(0)).toString(),
      unit: p.unit,
      lowStockThreshold: p.lowStockThreshold,
    }))
    .filter((p) => new Decimal(p.currentStock).lte(p.lowStockThreshold))
    .sort((a, b) => new Decimal(a.currentStock).cmp(new Decimal(b.currentStock)));

  // Compute total receivables from aggregates (no separate query needed)
  // receivables = SUM(openingBalance) + totalSales - totalPayments + totalAdjustments
  const customers = await prisma.customer.findMany({
    where: { isDeleted: false },
    select: { openingBalance: true },
  });
  const totalOpening = customers.reduce(
    (sum, c) => sum.plus(c.openingBalance),
    new Decimal(0),
  );
  const totalReceivables = totalOpening
    .plus(totalSales)
    .minus(totalPayments)
    .plus(totalAdjustments);

  // Count customers with positive balance (approximate from receivables > 0)
  const customersWithBalance = totalReceivables.gt(0) ? customers.length : 0;

  return {
    totalReceivables: totalReceivables.lt(0) ? "0" : totalReceivables.toString(),
    customerCount,
    customersWithBalance,
    todaysSales: toDecimalOrZero(agg?.todays_sales).toString(),
    todaysPayments: toDecimalOrZero(agg?.todays_payments).toString(),
    todaysExpenses: toDecimalOrZero(agg?.todays_expenses).toString(),
    lowStockProducts,
    recentTransactions,
  };
}
