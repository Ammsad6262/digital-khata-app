/**
 * Transaction service layer.
 *
 * The Transaction table is a denormalized unified ledger — one row per financial
 * movement. This service provides read-only queries over it (no writes here —
 * writes happen in the source services like sales.ts, payments.ts, etc.).
 *
 * Powers the "Transaction History" screen.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfTodayInTz, startOfWeekInTz, startOfMonthInTz } from "@/lib/utils/date";
import type { Prisma } from "@prisma/client";

export type TransactionView = {
  id: string;
  type: string;
  refType: string;
  refId: string;
  customerId: string | null;
  productId: string | null;
  amount: string;
  direction: string;
  date: Date;
  notes: string | null;
  createdAt: Date;
};

function toView(t: Prisma.TransactionGetPayload<{}>): TransactionView {
  return {
    id: t.id,
    type: t.type,
    refType: t.refType,
    refId: t.refId,
    customerId: t.customerId,
    productId: t.productId,
    amount: t.amount.toString(),
    direction: t.direction,
    date: t.date,
    notes: t.notes,
    createdAt: t.createdAt,
  };
}

export type TransactionFilter = "today" | "week" | "month" | "all";

function getFilterStart(filter: TransactionFilter, timezone: string): Date | undefined {
  switch (filter) {
    case "today": return startOfTodayInTz(timezone);
    case "week":  return startOfWeekInTz(timezone);
    case "month": return startOfMonthInTz(timezone);
    case "all":   return undefined;
  }
}

/** List transactions, optionally filtered by time range and/or type. */
export async function listTransactions(
  options: {
    filter?: TransactionFilter;
    type?: string;
    customerId?: string;
    productId?: string;
    limit?: number;
    timezone?: string;
  } = {},
): Promise<TransactionView[]> {
  const {
    filter = "all",
    type,
    customerId,
    productId,
    limit = 100,
    timezone = "Asia/Karachi",
  } = options;

  const startDate = getFilterStart(filter, timezone);

  const transactions = await prisma.transaction.findMany({
    where: {
      ...(startDate && { date: { gte: startDate } }),
      ...(type && { type }),
      ...(customerId && { customerId }),
      ...(productId && { productId }),
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  return transactions.map(toView);
}

/** Recent transactions for the dashboard (mixed types, last 10). */
export async function getRecentTransactions(limit = 10): Promise<TransactionView[]> {
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    take: limit,
  });
  return transactions.map(toView);
}

/**
 * Compute totals for a given time range.
 * Used by the Business Summary screen.
 */
export async function getTotalsForRange(
  startDate: Date,
  endDate: Date = new Date(),
  timezone: string = "Asia/Karachi",
): Promise<{
  totalSales: string;
  totalPayments: string;
  totalExpenses: string;
  totalCredit: string; // sum of (sale.totalAmount - sale.paidAmount) for new sales in range
}> {
  // We need totals for each type. Easiest is 4 separate aggregates on the
  // specialized tables (more accurate than the denormalized Transaction table
  // because of voiding semantics).
  const [salesAgg, paymentsAgg, expensesAgg, creditSalesAgg] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { voidedAt: null, date: { gte: startDate, lte: endDate } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { voidedAt: null, date: { gte: startDate, lte: endDate } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { voidedAt: null, date: { gte: startDate, lte: endDate } },
    }),
    // Total credit given in range = SUM(sale.outstanding) where sale.date in range
    prisma.sale.aggregate({
      _sum: { outstanding: true },
      where: { voidedAt: null, date: { gte: startDate, lte: endDate } },
    }),
  ]);

  return {
    totalSales: toDecimalOrZero(salesAgg._sum.totalAmount).toString(),
    totalPayments: toDecimalOrZero(paymentsAgg._sum.amount).toString(),
    totalExpenses: toDecimalOrZero(expensesAgg._sum.amount).toString(),
    totalCredit: toDecimalOrZero(creditSalesAgg._sum.outstanding).toString(),
  };
}
