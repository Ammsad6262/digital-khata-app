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
  // NOTE: total_sales / total_payments / total_adjustments are intentionally
  // NOT extracted here. They were previously used to compute totalReceivables
  // as a single global sum, but that approach was buggy (see Batch 4 below for
  // the correct per-customer computation). Extracting them via toDecimalOrZero
  // also failed at runtime because Prisma raw queries return SUM(decimal) as
  // JS `bigint`, which decimal.js's constructor rejects.

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

  // Batch 4: Per-customer balance computation.
  //
  // For each customer, balance = openingBalance
  //                              + SUM(their sales.totalAmount)
  //                              - SUM(their payments.amount)
  //                              + SUM(their adjustments.amount)
  //
  // We use this to:
  //   - count customers whose individual balance is > 0  (customersWithBalance)
  //   - recompute totalReceivables as SUM(per-customer balances), clamped at 0
  //     per customer (a single customer's negative balance should NOT offset
  //     others' positive balances — that's the whole point of a khata).
  //
  // The previous buggy implementation did:
  //     customersWithBalance = totalReceivables.gt(0) ? customers.length : 0
  // which incorrectly reported EVERY customer as owing money whenever the
  // total was positive — e.g. "3 customers owe you 500" when actually only
  // 1 of the 3 customers had any outstanding balance.
  //
  // Note: the explicit `CAST(... AS NUMERIC)` is required. Without it,
  // Postgres infers `integer` for the COALESCE fallback `0` literal, and
  // Prisma therefore returns the whole expression as JS `bigint` — which
  // then breaks Decimal() construction in the JS loop below.
  const perCustomerBalances = await prisma.$queryRaw<Array<{
    balance: Decimal | null;
  }>>`
    SELECT
      CAST(
        c."openingBalance"
          + COALESCE((
            SELECT SUM(s."totalAmount") FROM "Sale" s
            WHERE s."customerId" = c.id AND s."voidedAt" IS NULL
          ), 0)
          - COALESCE((
            SELECT SUM(p."amount") FROM "Payment" p
            WHERE p."customerId" = c.id AND p."voidedAt" IS NULL
          ), 0)
          + COALESCE((
            SELECT SUM(a."amount") FROM "CustomerAdjustment" a
            WHERE a."customerId" = c.id AND a."voidedAt" IS NULL
          ), 0)
        AS NUMERIC
      ) AS balance
    FROM "Customer" c
    WHERE c."isDeleted" = false
  `;

  // Count customers whose individual balance is strictly positive, and
  // sum those positive balances for the totalReceivables. Negative balances
  // (customer overpaid / has credit) do NOT offset other customers' dues.
  let customersWithBalance = 0;
  let totalReceivables = new Decimal(0);
  for (const row of perCustomerBalances) {
    // row.balance can come back as Decimal, string, number, or bigint
    // depending on the Prisma raw-query type mapping. Normalize via toString()
    // before constructing a Decimal — Decimal.js accepts strings safely.
    const raw = row?.balance;
    const balance =
      raw === null || raw === undefined
        ? new Decimal(0)
        : new Decimal(raw.toString());
    if (balance.gt(0)) {
      customersWithBalance += 1;
      totalReceivables = totalReceivables.plus(balance);
    }
  }

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
