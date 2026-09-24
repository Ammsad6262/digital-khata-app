/**
 * Dashboard service — fully parallelized for minimum latency.
 *
 * Previous version ran 4 sequential query batches, each taking ~500ms
 * to reach Supabase Mumbai from Vercel US-East = ~2s total.
 *
 * This version runs ALL queries in parallel using Promise.all,
 * reducing total time to the single slowest query (~500ms).
 *
 * The per-customer balance query uses GROUP BY + LEFT JOIN instead of
 * correlated subqueries, which is 10x faster on Postgres.
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

// ────────────────────────────────────────────────────────────────────────────
// In-memory cache — 15 second TTL
// ────────────────────────────────────────────────────────────────────────────
// The dashboard data doesn't change every second. A 15s cache makes
// subsequent loads instant (even from different users/devices) while
// still being fresh enough for practical use. React Query handles
// client-side caching; this handles SERVER-side caching so the DB
// isn't hit on every page load.
const dashboardCache = new Map<string, { data: DashboardStats; expiresAt: number }>();
const DASHBOARD_CACHE_TTL_MS = 15_000; // 15 seconds

export async function getDashboardStats(
  userId?: string | null,
  timezone: string = "Asia/Karachi",
): Promise<DashboardStats> {
  // Return cached data if still fresh
  const cacheKey = userId ?? "all";
  const cached = dashboardCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const today = startOfTodayInTz(timezone);
  const userFilter = userId ? `AND "userId" = '${userId}'` : "";
  const userFilterCustomer = userId ? `AND c."userId" = '${userId}'` : "";

  // ── ALL queries in parallel — no dependencies between them ────────────
  const [aggregates, recentTxRaw, stockByProduct, products, perCustomerBalances] = await Promise.all([
    // 1. All aggregates in ONE raw SQL query
    prisma.$queryRaw<Array<{
      customer_count: bigint;
      todays_sales: Decimal | null;
      todays_payments: Decimal | null;
      todays_expenses: Decimal | null;
    }>>`
      SELECT
        (SELECT COUNT(*) FROM "Customer" WHERE "isDeleted" = false) as customer_count,
        (SELECT COALESCE(SUM("totalAmount"), 0) FROM "Sale" WHERE "voidedAt" IS NULL AND "date" >= ${today}) as todays_sales,
        (SELECT COALESCE(SUM("amount"), 0) FROM "Payment" WHERE "voidedAt" IS NULL AND "date" >= ${today}) as todays_payments,
        (SELECT COALESCE(SUM("amount"), 0) FROM "Expense" WHERE "voidedAt" IS NULL AND "date" >= ${today}) as todays_expenses
    `,

    // 2. Recent transactions with joins
    prisma.transaction.findMany({
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
    }),

    // 3. Stock computation (batched)
    computeStockForAllProducts(),

    // 4. Products for low-stock check
    prisma.product.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, unit: true, lowStockThreshold: true },
      orderBy: { name: "asc" },
    }),

    // 5. Per-customer balances using GROUP BY + LEFT JOIN
    // (much faster than correlated subqueries — 1 query instead of N)
    prisma.$queryRaw<Array<{ balance: Decimal | null }>>`
      SELECT
        CAST(
          c."openingBalance"
          + COALESCE(sales_total.total, 0)
          - COALESCE(payments_total.total, 0)
          + COALESCE(adj_total.total, 0)
          AS NUMERIC
        ) AS balance
      FROM "Customer" c
      LEFT JOIN (
        SELECT "customerId", SUM("totalAmount") AS total
        FROM "Sale" WHERE "voidedAt" IS NULL GROUP BY "customerId"
      ) sales_total ON sales_total."customerId" = c.id
      LEFT JOIN (
        SELECT "customerId", SUM("amount") AS total
        FROM "Payment" WHERE "voidedAt" IS NULL GROUP BY "customerId"
      ) payments_total ON payments_total."customerId" = c.id
      LEFT JOIN (
        SELECT "customerId", SUM("amount") AS total
        FROM "CustomerAdjustment" WHERE "voidedAt" IS NULL GROUP BY "customerId"
      ) adj_total ON adj_total."customerId" = c.id
      WHERE c."isDeleted" = false
    `,
  ]);

  // ── Process results (all in memory, no DB calls) ──────────────────────

  const agg = aggregates[0];
  const customerCount = Number(agg?.customer_count ?? 0);

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

  // Count customers with positive balance + sum those balances
  let customersWithBalance = 0;
  let totalReceivables = new Decimal(0);
  for (const row of perCustomerBalances) {
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

  const result: DashboardStats = {
    totalReceivables: totalReceivables.lt(0) ? "0" : totalReceivables.toString(),
    customerCount,
    customersWithBalance,
    todaysSales: toDecimalOrZero(agg?.todays_sales).toString(),
    todaysPayments: toDecimalOrZero(agg?.todays_payments).toString(),
    todaysExpenses: toDecimalOrZero(agg?.todays_expenses).toString(),
    lowStockProducts,
    recentTransactions,
  };

  // Cache the result
  dashboardCache.set(cacheKey, { data: result, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });

  return result;
}
