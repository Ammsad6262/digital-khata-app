/**
 * Profit & Loss service layer.
 *
 * Computes the full P&L picture for the dashboard:
 *   Revenue     = SUM(saleItem.quantity × saleItem.unitPrice)   [active sales only]
 *   COGS        = SUM(saleItem.quantity × batch.unitCost)        [if linked to a batch]
 *               + SUM(saleItem.quantity × product.purchasePrice) [fallback for untracked items]
 *   Gross Profit = Revenue − COGS
 *   Expenses    = SUM(expense.amount)                           [active only]
 *   Net Profit  = Gross Profit − Expenses
 *   Margin %    = (Net Profit / Revenue) × 100
 *
 * All computed across 4 periods: today / this week / this month / all time.
 *
 * Performance: uses Prisma.sql for safe parameterized queries with conditional
 * date filtering. Each period runs 2 queries (sales + expenses) in parallel.
 */

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { cached } from "@/lib/utils/cache";
import {
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
} from "@/lib/utils/date";

export type ProfitLossPeriod = {
  revenue: string;        // total sales (quantity × unitPrice)
  cogs: string;           // cost of goods sold
  grossProfit: string;    // revenue − cogs
  expenses: string;       // total business expenses
  netProfit: string;      // grossProfit − expenses
  profitMargin: string;   // netProfit / revenue × 100 (2 decimal places)
  salesCount: number;     // number of active sales in this period
  expenseCount: number;   // number of active expenses in this period
};

export type ProfitLossStats = {
  today: ProfitLossPeriod;
  thisWeek: ProfitLossPeriod;
  thisMonth: ProfitLossPeriod;
  allTime: ProfitLossPeriod;
};

// ────────────────────────────────────────────────────────────────────────────
// Single-period computation
// ────────────────────────────────────────────────────────────────────────────

async function computePeriod(startDate: Date | null): Promise<ProfitLossPeriod> {
  // Build the date filter clause. For all-time (startDate=null), use '1=1' (no filter).
  // We pass the date as a parameter to prevent SQL injection.
  const dateFilter = startDate
    ? Prisma.sql`AND s."date" >= ${startDate} AND e."date" >= ${startDate}`
    : Prisma.sql``;

  // Revenue + COGS + Expenses in ONE query using LEFT JOINs:
  //   - SaleItem → Sale (for voidedAt + date filter)
  //   - SaleItem → StockMove (for batch unitCost — may be NULL)
  //   - SaleItem → Product (for purchasePrice fallback)
  //
  // COALESCE(sm."unitCost", p."purchasePrice", 0) picks:
  //   1. The batch's unitCost if the sale item is linked to a purchase batch
  //   2. The product's default purchasePrice if no batch (legacy/opening stock)
  //   3. 0 if neither is set (free stock, or product has no purchase price)
  //
  // We use a subquery for expenses because it's a different table (no JOIN needed).
  const rows = await prisma.$queryRaw<Array<{
    revenue: Decimal | null;
    cogs: Decimal | null;
    expenses: Decimal | null;
    sales_count: bigint;
    expense_count: bigint;
  }>>`
    SELECT
      COALESCE(
        (SELECT SUM(si."quantity" * si."unitPrice")
         FROM "SaleItem" si
         JOIN "Sale" s ON si."saleId" = s.id
         WHERE s."voidedAt" IS NULL ${
           startDate ? Prisma.sql`AND s."date" >= ${startDate}` : Prisma.sql``
         }),
        0
      ) AS revenue,
      COALESCE(
        (SELECT SUM(si."quantity" * COALESCE(sm."unitCost", p."purchasePrice", 0))
         FROM "SaleItem" si
         JOIN "Sale" s ON si."saleId" = s.id
         LEFT JOIN "StockMove" sm ON si."stockMoveId" = sm.id
         LEFT JOIN "Product" p ON si."productId" = p.id
         WHERE s."voidedAt" IS NULL ${
           startDate ? Prisma.sql`AND s."date" >= ${startDate}` : Prisma.sql``
         }),
        0
      ) AS cogs,
      COALESCE(
        (SELECT SUM("amount") FROM "Expense" WHERE "voidedAt" IS NULL ${
          startDate ? Prisma.sql`AND "date" >= ${startDate}` : Prisma.sql``
        }),
        0
      ) AS expenses,
      (SELECT COUNT(*) FROM "Sale" WHERE "voidedAt" IS NULL ${
        startDate ? Prisma.sql`AND "date" >= ${startDate}` : Prisma.sql``
      }) AS sales_count,
      (SELECT COUNT(*) FROM "Expense" WHERE "voidedAt" IS NULL ${
        startDate ? Prisma.sql`AND "date" >= ${startDate}` : Prisma.sql``
      }) AS expense_count
  `;

  const row = rows[0];
  const revenue = toDecimalOrZero(row?.revenue);
  const cogs = toDecimalOrZero(row?.cogs);
  const expenses = toDecimalOrZero(row?.expenses);
  const grossProfit = revenue.minus(cogs);
  const netProfit = grossProfit.minus(expenses);
  const salesCount = Number(row?.sales_count ?? 0);
  const expenseCount = Number(row?.expense_count ?? 0);
  const margin = revenue.gt(0)
    ? netProfit.div(revenue).times(100).toDecimalPlaces(2)
    : new Decimal(0);

  return {
    revenue: revenue.toString(),
    cogs: cogs.toString(),
    grossProfit: grossProfit.toString(),
    expenses: expenses.toString(),
    netProfit: netProfit.toString(),
    profitMargin: margin.toString(),
    salesCount,
    expenseCount,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public: compute all 4 periods
// ────────────────────────────────────────────────────────────────────────────

export async function getProfitLossStats(
  timezone: string = "Asia/Karachi",
): Promise<ProfitLossStats> {
  return cached("profit-loss", async () => {
    const today = startOfTodayInTz(timezone);
    const weekStart = startOfWeekInTz(timezone);
    const monthStart = startOfMonthInTz(timezone);

    // Run all 4 period queries in parallel — no dependency between them.
    const [todayStats, weekStats, monthStats, allTimeStats] = await Promise.all([
      computePeriod(today),
      computePeriod(weekStart),
      computePeriod(monthStart),
      computePeriod(null), // all-time: no date filter
    ]);

    return {
      today: todayStats,
      thisWeek: weekStats,
      thisMonth: monthStats,
      allTime: allTimeStats,
    };
  });
}
