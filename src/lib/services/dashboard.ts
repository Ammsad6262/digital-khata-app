/**
 * Dashboard service — multi-tenant scoped, fully parallelized.
 *
 * Every query is scoped by `userId` (required). The dashboard never leaks
 * another user's data — verified end-to-end via the e2e test suite.
 *
 * Performance: all 5 queries run in parallel via Promise.all, so total
 * time = single slowest query (~500ms from US-East to Supabase Mumbai).
 *
 * Server-side cache: 5 seconds (short — fresh data matters for the dashboard,
 * but 5s is enough to absorb a double-load from React Query's mount+refetch).
 */

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfTodayInTz } from "@/lib/utils/date";
import { computeStockForAllProducts } from "@/lib/services/products";
import { UnauthorizedError } from "@/lib/errors";

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
// In-memory cache — 5 second TTL (very short so dashboard stays fresh)
// ────────────────────────────────────────────────────────────────────────────
// The dashboard is the home screen — users open it to see CURRENT numbers.
// A 5s cache absorbs a double-load from React Query (mount + refetch) but
// is short enough that data added moments ago appears on the next refresh.
const dashboardCache = new Map<string, { data: DashboardStats; expiresAt: number }>();
const DASHBOARD_CACHE_TTL_MS = 5_000; // 5 seconds

/** Clear the dashboard cache — called by invalidateCache("dashboard") after
 *  any mutation (sale/payment/expense/etc.) so the next read gets fresh data. */
export function clearDashboardCache(): void {
  dashboardCache.clear();
}

export async function getDashboardStats(
  userId: string,
  timezone: string = "Asia/Karachi",
): Promise<DashboardStats> {
  if (!userId) {
    throw new UnauthorizedError("Authentication required to load dashboard.");
  }

  // Return cached data if still fresh (per-user cache key)
  const cacheKey = userId;
  const cached = dashboardCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const today = startOfTodayInTz(timezone);

  // All queries below are scoped by userId. We use Prisma.sql tagged template
  // literals so ${userId} is parameterized (safe from SQL injection).
  // NOTE: the per-customer-balance subqueries don't use table aliases, so
  // the filter must reference the unqualified "userId" column (not "s"."userId").
  const saleUserFilter = Prisma.sql`AND "userId" = ${userId}`;
  const expenseUserFilter = Prisma.sql`AND "userId" = ${userId}`;
  const customerUserFilter = Prisma.sql`AND c."userId" = ${userId}`;

  // ── ALL queries in parallel — no dependencies between them ────────────
  const [aggregates, recentTxRaw, stockByProduct, products, perCustomerBalances] = await Promise.all([
    // 1. All aggregates in ONE raw SQL query — scoped by userId
    prisma.$queryRaw<Array<{
      customer_count: bigint;
      todays_sales: Decimal | null;
      todays_payments: Decimal | null;
      todays_expenses: Decimal | null;
    }>>`
      SELECT
        (SELECT COUNT(*) FROM "Customer" WHERE "isDeleted" = false AND "userId" = ${userId}) as customer_count,
        (SELECT COALESCE(SUM("totalAmount"), 0) FROM "Sale" WHERE "voidedAt" IS NULL AND "date" >= ${today} AND "userId" = ${userId}) as todays_sales,
        (SELECT COALESCE(SUM("amount"), 0) FROM "Payment" WHERE "voidedAt" IS NULL AND "date" >= ${today} AND "userId" = ${userId}) as todays_payments,
        (SELECT COALESCE(SUM("amount"), 0) FROM "Expense" WHERE "voidedAt" IS NULL AND "date" >= ${today} AND "userId" = ${userId}) as todays_expenses
    `,

    // 2. Recent transactions — scoped by userId
    prisma.transaction.findMany({
      where: { userId },
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

    // 3. Stock computation (batched) — scoped by userId
    computeStockForAllProducts(userId),

    // 4. Products for low-stock check — scoped by userId
    prisma.product.findMany({
      where: { isDeleted: false, userId },
      select: { id: true, name: true, unit: true, lowStockThreshold: true },
      orderBy: { name: "asc" },
    }),

    // 5. Per-customer balances using GROUP BY + LEFT JOIN — scoped by userId
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
        FROM "Sale" WHERE "voidedAt" IS NULL ${saleUserFilter} GROUP BY "customerId"
      ) sales_total ON sales_total."customerId" = c.id
      LEFT JOIN (
        SELECT "customerId", SUM("amount") AS total
        FROM "Payment" WHERE "voidedAt" IS NULL ${expenseUserFilter} GROUP BY "customerId"
      ) payments_total ON payments_total."customerId" = c.id
      LEFT JOIN (
        SELECT "customerId", SUM("amount") AS total
        FROM "CustomerAdjustment" WHERE "voidedAt" IS NULL ${expenseUserFilter} GROUP BY "customerId"
      ) adj_total ON adj_total."customerId" = c.id
      WHERE c."isDeleted" = false ${customerUserFilter}
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

  // Cache the result (per-user)
  dashboardCache.set(cacheKey, { data: result, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });

  return result;
}
