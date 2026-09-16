/**
 * Dashboard service layer.
 *
 * Aggregates the stats shown on the home screen:
 *   - Total receivables (sum of all customer balances > 0)
 *   - Today's sales / payments received / expenses
 *   - Customer count
 *   - Low-stock product count
 *   - Recent transactions
 *
 * All aggregates exclude voided records.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfTodayInTz } from "@/lib/utils/date";
import { computeStockForAllProducts } from "@/lib/services/products";
import { listOutstandingCustomers } from "@/lib/services/customers";
import { getRecentTransactions } from "@/lib/services/transactions";

export type DashboardStats = {
  totalReceivables: string;
  todaysSales: string;
  todaysPayments: string;
  todaysExpenses: string;
  customerCount: number;
  lowStockProductCount: number;
  recentTransactions: Awaited<ReturnType<typeof getRecentTransactions>>;
};

/**
 * Get the dashboard stats.
 *
 * Note on performance: `totalReceivables` calls listOutstandingCustomers which
 * is N+1 (per customer). For a small business (≤ 500 customers) this is fine.
 * For V2 scale, denormalize into a CustomerBalance view.
 */
export async function getDashboardStats(
  timezone: string = "Asia/Karachi",
): Promise<DashboardStats> {
  const today = startOfTodayInTz(timezone);

  const [outstanding, todaysSalesAgg, todaysPaymentsAgg, todaysExpensesAgg,
         customerCount, lowStockCount, recentTx] = await Promise.all([
    listOutstandingCustomers(),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { voidedAt: null, date: { gte: today } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { voidedAt: null, date: { gte: today } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { voidedAt: null, date: { gte: today } },
    }),
    prisma.customer.count({ where: { isDeleted: false } }),
    countLowStockProducts(),
    getRecentTransactions(10),
  ]);

  const totalReceivables = outstanding.reduce<Decimal>(
    (sum, c) => sum.plus(new Decimal(c.balance)),
    new Decimal(0),
  );

  return {
    totalReceivables: totalReceivables.toString(),
    todaysSales: toDecimalOrZero(todaysSalesAgg._sum.totalAmount).toString(),
    todaysPayments: toDecimalOrZero(todaysPaymentsAgg._sum.amount).toString(),
    todaysExpenses: toDecimalOrZero(todaysExpensesAgg._sum.amount).toString(),
    customerCount,
    lowStockProductCount: lowStockCount,
    recentTransactions: recentTx,
  };
}

/** Count products whose current stock is at or below their lowStockThreshold. */
async function countLowStockProducts(): Promise<number> {
  const stockByProduct = await computeStockForAllProducts();
  const products = await prisma.product.findMany({
    where: { isDeleted: false },
    select: { id: true, lowStockThreshold: true },
  });

  let count = 0;
  for (const p of products) {
    const stock = stockByProduct.get(p.id) ?? new Decimal(0);
    if (stock.lte(p.lowStockThreshold)) count += 1;
  }
  return count;
}
