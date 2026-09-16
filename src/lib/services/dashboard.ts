/**
 * Dashboard service layer.
 *
 * Aggregates the stats shown on the home screen:
 *   - Total receivables (sum of all customer balances > 0)
 *   - Today's sales / payments received / expenses
 *   - Customer count
 *   - Low-stock products (with names + current stock for display)
 *   - Recent transactions (with customer/product names for context)
 *
 * All aggregates exclude voided records.
 *
 * IMPORTANT: This service uses the SAME business logic as the rest of the
 * app — balances are derived from `opening + sales - payments + adjustments`,
 * stock is derived from `opening + stockMoves - saleItems`. No duplicated
 * calculations, no fake numbers.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfTodayInTz } from "@/lib/utils/date";
import { computeStockForAllProducts } from "@/lib/services/products";
import { listOutstandingCustomers } from "@/lib/services/customers";

// ────────────────────────────────────────────────────────────────────────────
// Types — exported so the frontend hooks can be type-safe
// ────────────────────────────────────────────────────────────────────────────

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
// Main entry point
// ────────────────────────────────────────────────────────────────────────────

export async function getDashboardStats(
  timezone: string = "Asia/Karachi",
): Promise<DashboardStats> {
  const today = startOfTodayInTz(timezone);

  // Run all independent queries in parallel.
  const [
    outstanding,
    todaysSalesAgg,
    todaysPaymentsAgg,
    todaysExpensesAgg,
    customerCount,
    lowStockProducts,
    recentTxRaw,
  ] = await Promise.all([
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
    getLowStockProducts(),
    getRecentTransactionsRaw(10),
  ]);

  // Enrich recent transactions with customer/product names.
  const recentTransactions = await enrichTransactions(recentTxRaw);

  const totalReceivables = outstanding.reduce<Decimal>(
    (sum, c) => sum.plus(new Decimal(c.balance)),
    new Decimal(0),
  );

  return {
    totalReceivables: totalReceivables.toString(),
    customerCount,
    customersWithBalance: outstanding.length,
    todaysSales: toDecimalOrZero(todaysSalesAgg._sum.totalAmount).toString(),
    todaysPayments: toDecimalOrZero(todaysPaymentsAgg._sum.amount).toString(),
    todaysExpenses: toDecimalOrZero(todaysExpensesAgg._sum.amount).toString(),
    lowStockProducts,
    recentTransactions,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Returns products whose current stock ≤ lowStockThreshold, sorted by stock asc. */
async function getLowStockProducts(): Promise<LowStockProduct[]> {
  const stockByProduct = await computeStockForAllProducts();
  const products = await prisma.product.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      name: true,
      unit: true,
      lowStockThreshold: true,
    },
    orderBy: { name: "asc" },
  });

  const lowStock = products
    .map((p) => ({
      id: p.id,
      name: p.name,
      currentStock: (stockByProduct.get(p.id) ?? new Decimal(0)).toString(),
      unit: p.unit,
      lowStockThreshold: p.lowStockThreshold,
    }))
    .filter((p) => new Decimal(p.currentStock).lte(p.lowStockThreshold));

  // Sort by current stock ascending (most depleted first).
  lowStock.sort((a, b) =>
    new Decimal(a.currentStock).cmp(new Decimal(b.currentStock)),
  );

  return lowStock;
}

/** Fetch recent transactions (raw, without customer/product names). */
async function getRecentTransactionsRaw(limit: number) {
  return prisma.transaction.findMany({
    orderBy: { date: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      refType: true,
      refId: true,
      customerId: true,
      productId: true,
      amount: true,
      direction: true,
      date: true,
      notes: true,
    },
  });
}

/** Enrich transactions with customerName / productName for display. */
async function enrichTransactions(
  txs: Awaited<ReturnType<typeof getRecentTransactionsRaw>>,
): Promise<RecentTransaction[]> {
  // Collect unique customer/product IDs to fetch in batch (avoids N+1).
  const customerIds = new Set<string>();
  const productIds = new Set<string>();
  for (const tx of txs) {
    if (tx.customerId) customerIds.add(tx.customerId);
    if (tx.productId) productIds.add(tx.productId);
  }

  const [customers, products] = await Promise.all([
    customerIds.size > 0
      ? prisma.customer.findMany({
          where: { id: { in: [...customerIds] } },
          select: { id: true, name: true },
        })
      : [],
    productIds.size > 0
      ? prisma.product.findMany({
          where: { id: { in: [...productIds] } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  return txs.map((tx) => ({
    id: tx.id,
    type: tx.type as RecentTransaction["type"],
    refType: tx.refType,
    refId: tx.refId,
    amount: tx.amount.toString(),
    direction: tx.direction,
    date: tx.date,
    notes: tx.notes,
    customerName: tx.customerId
      ? (customerNameById.get(tx.customerId) ?? null)
      : null,
    productName: tx.productId
      ? (productNameById.get(tx.productId) ?? null)
      : null,
  }));
}
