/**
 * Transaction service layer.
 *
 * The Transaction table is a denormalized unified ledger — one row per financial
 * movement. This service provides read-only queries over it (no writes here —
 * writes happen in the source services like sales.ts, payments.ts, etc.).
 *
 * Powers the "Transaction History" screen.
 *
 * IMPORTANT: The Transaction table is a MIRROR. The source-of-truth records
 * live in their specialized tables (Sale, Payment, Expense, StockMove,
 * CustomerAdjustment). This service NEVER duplicates those records — it just
 * reads the mirror for fast unified queries. If they ever diverge (a bug),
 * the specialized tables win.
 *
 * To display customer/product names alongside each transaction, we batch-fetch
 * them — never N+1.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfTodayInTz, startOfWeekInTz, startOfMonthInTz } from "@/lib/utils/date";
import type { Prisma } from "@prisma/client";

// ────────────────────────────────────────────────────────────────────────────
// View types
// ────────────────────────────────────────────────────────────────────────────

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

/**
 * Enriched view — same as TransactionView + customerName + productName for display.
 * This is what the Transaction History UI receives.
 */
export type TransactionListItem = TransactionView & {
  customerName: string | null;
  productName: string | null;
};

export type TransactionFilter = "today" | "week" | "month" | "all" | "custom";

export type TransactionType =
  | "sale"
  | "payment"
  | "expense"
  | "stock_move"
  | "balance_adjustment";

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

function getFilterStart(filter: TransactionFilter, timezone: string): Date | undefined {
  switch (filter) {
    case "today": return startOfTodayInTz(timezone);
    case "week":  return startOfWeekInTz(timezone);
    case "month": return startOfMonthInTz(timezone);
    case "all":   return undefined;
    case "custom": return undefined; // custom range handled separately via from/to
  }
}

// ────────────────────────────────────────────────────────────────────────────
// List (raw — used internally by dashboard)
// ────────────────────────────────────────────────────────────────────────────

/**
 * List transactions, optionally filtered by time range and/or type.
 *
 * When `userId` is provided, only transactions belonging to that user are
 * returned (multi-tenant isolation). When null, ALL transactions are visible
 * (backward compat for pre-auth data).
 */
export async function listTransactions(
  options: {
    filter?: TransactionFilter;
    type?: string;
    customerId?: string;
    productId?: string;
    limit?: number;
    timezone?: string;
    from?: Date;  // custom range start (overrides filter if filter='custom')
    to?: Date;    // custom range end (inclusive)
  } = {},
  userId?: string | null,
): Promise<TransactionView[]> {
  const {
    filter = "all",
    type,
    customerId,
    productId,
    limit = 100,
    timezone = "Asia/Karachi",
    from,
    to,
  } = options;

  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (filter === "custom") {
    startDate = from;
    endDate = to;
  } else {
    startDate = getFilterStart(filter, timezone);
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      ...(userId && { userId }),
      ...(startDate && { date: { gte: startDate } }),
      ...(endDate && { date: { lte: endDate } }),
      ...(type && { type }),
      ...(customerId && { customerId }),
      ...(productId && { productId }),
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  return transactions.map(toView);
}

// ────────────────────────────────────────────────────────────────────────────
// List (enriched — used by the Transaction History page)
// ────────────────────────────────────────────────────────────────────────────

/**
 * List transactions WITH customer/product names enriched (batch-fetched, no N+1).
 *
 * Supports all filter options including custom date range.
 *
 * When `userId` is provided, only transactions belonging to that user are
 * returned (multi-tenant isolation).
 *
 * This is the main query powering the /more/transactions page.
 */
export async function listTransactionsEnriched(
  options: {
    filter?: TransactionFilter;
    type?: string;
    customerId?: string;
    productId?: string;
    limit?: number;
    timezone?: string;
    from?: Date;
    to?: Date;
  } = {},
  userId?: string | null,
): Promise<TransactionListItem[]> {
  const raw = await listTransactions(options, userId);

  if (raw.length === 0) return [];

  // Batch-fetch customer + product names for all transactions at once.
  const customerIds = new Set<string>();
  const productIds = new Set<string>();
  for (const tx of raw) {
    if (tx.customerId) customerIds.add(tx.customerId);
    if (tx.productId) productIds.add(tx.productId);
  }

  const [customers, products] = await Promise.all([
    customerIds.size > 0
      ? prisma.customer.findMany({
          where: { id: { in: [...customerIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    productIds.size > 0
      ? prisma.product.findMany({
          where: { id: { in: [...productIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  return raw.map((tx) => ({
    ...tx,
    customerName: tx.customerId ? (customerNameById.get(tx.customerId) ?? null) : null,
    productName: tx.productId ? (productNameById.get(tx.productId) ?? null) : null,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Recent (for dashboard)
// ────────────────────────────────────────────────────────────────────────────

/** Recent transactions for the dashboard (mixed types, last 10). */
export async function getRecentTransactions(limit = 10): Promise<TransactionView[]> {
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    take: limit,
  });
  return transactions.map(toView);
}

// ────────────────────────────────────────────────────────────────────────────
// Totals (for Business Summary screen — Phase 11)
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Summary card stats (count + total amount per type for current filter)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute summary stats for the same filter applied to listTransactionsEnriched.
 * Returns count + total amount (signed: payments are +, expenses are -,
 * sales show full sale amount, stock moves show movement cost).
 *
 * When `userId` is provided, only that user's transactions are summed.
 *
 * Used by the Transaction History summary card.
 */
export async function getTransactionSummary(
  options: {
    filter?: TransactionFilter;
    type?: string;
    customerId?: string;
    from?: Date;
    to?: Date;
    timezone?: string;
  } = {},
  userId?: string | null,
): Promise<{
  count: number;
  totalIn: string;  // sum of payments received (credit on customer)
  totalOut: string; // sum of expenses + sales (debit)
}> {
  const { filter = "all", type, customerId, from, to, timezone = "Asia/Karachi" } = options;

  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (filter === "custom") {
    startDate = from;
    endDate = to;
  } else {
    startDate = getFilterStart(filter, timezone);
  }

  // Group by type and sum amount — single query
  const grouped = await prisma.transaction.groupBy({
    by: ["type", "direction"],
    _sum: { amount: true },
    _count: { id: true },
    where: {
      ...(userId && { userId }),
      ...(startDate && { date: { gte: startDate } }),
      ...(endDate && { date: { lte: endDate } }),
      ...(type && { type }),
      ...(customerId && { customerId }),
    },
  });

  let totalIn = new Decimal(0);   // payments (credit on customer = money in)
  let totalOut = new Decimal(0);  // expenses + sales
  let count = 0;

  for (const g of grouped) {
    const amount = toDecimalOrZero(g._sum.amount);
    count += g._count.id;

    if (g.type === "payment") {
      totalIn = totalIn.plus(amount);
    } else if (g.type === "expense") {
      totalOut = totalOut.plus(amount);
    } else if (g.type === "sale") {
      // Sales show as full amount (debit on customer)
      totalOut = totalOut.plus(amount);
    }
    // Stock moves + adjustments don't count toward cash flow
  }

  return {
    count,
    totalIn: totalIn.toString(),
    totalOut: totalOut.toString(),
  };
}
