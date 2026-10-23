/**
 * Reports service — the "how is the business doing?" picture for any date
 * window the owner picks.
 *
 * Everything here is computed from the owner's own records. Nothing is
 * estimated silently: whenever a figure is not a hard fact (cost of goods,
 * profit), the report also returns the limitation that applies, so the UI can
 * say so in plain language.
 *
 * Key definitions:
 *   Sales billed        = SUM(SaleItem.quantity × unitPrice) for active sales
 *   Cash received       = SUM(Payment.amount) in the window (every payment,
 *                         including one taken at sale time, is a Payment row)
 *   Purchases billed    = SUM(Purchase.totalAmount) for active purchases
 *   Cash paid to supplier = purchase.paidAmount + SupplierPayment.amount
 *                         (no double count — see services/purchases.ts)
 *   Cost of goods       = batch unitCost, else product.purchasePrice
 *   Net estimate        = gross profit − recorded expenses
 *
 * Receivables, payables and stock value are point-in-time: they are "as of
 * now", not "as of the end of the window". The UI labels them that way.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { BadRequestError } from "@/lib/errors";
import {
  startOfDayInTz,
  todayDateStringInTz,
  dateStringInTz,
  startOfMonthInTz,
  startOfWeekInTz,
  startOfLastMonthInTz,
  startOfYearInTz,
} from "@/lib/utils/date";
import { getProfitLossRange, type ProfitLossPeriod } from "@/lib/services/profit-loss";
import { listOutstandingCustomers } from "@/lib/services/customers";
import { listSuppliersWithBalance } from "@/lib/services/suppliers";
import { listProductsWithStock } from "@/lib/services/products";

export type ReportLimitation = {
  /** Translation key, e.g. "reports.limit.cogs". */
  key: string;
  params?: Record<string, string | number>;
};

export type ReportExpenseCategory = {
  category: string;
  amount: string;
  count: number;
};

export type ReportTopProduct = {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  revenue: string;
};

export type ReportData = {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  timezone: string;
  sales: {
    billed: string;
    cashReceived: string;
    count: number;
  };
  purchases: {
    billed: string;
    cashPaid: string;
    count: number;
  };
  expenses: {
    total: string;
    count: number;
    byCategory: ReportExpenseCategory[];
  };
  profit: ProfitLossPeriod;
  position: {
    receivables: string;
    receivablesCount: number;
    payables: string;
    payablesCount: number;
    stockValue: string;
    stockProducts: number;
  };
  topProducts: ReportTopProduct[];
  limitations: ReportLimitation[];
};

const MAX_RANGE_DAYS = 366;

export type ReportPreset =
  | "today"
  | "week"
  | "month"
  | "lastMonth"
  | "last7"
  | "last30"
  | "year";

/**
 * Turn a named preset into a `{ from, to }` pair of calendar dates, computed
 * in the business timezone. Returns null for an unknown preset so the caller
 * can fall back to explicit dates.
 */
export function rangeForPreset(
  preset: string | null | undefined,
  timezone: string = "Asia/Karachi",
): { from: string; to: string } | null {
  const today = todayDateStringInTz(timezone);
  const daysAgo = (n: number): string => {
    const start = startOfDayInTz(today, timezone);
    if (!start) return today;
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - n);
    return dateStringInTz(d, timezone);
  };

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: dateStringInTz(startOfWeekInTz(timezone), timezone), to: today };
    case "month":
      return { from: dateStringInTz(startOfMonthInTz(timezone), timezone), to: today };
    case "lastMonth": {
      const end = startOfMonthInTz(timezone); // exclusive
      const last = new Date(end);
      last.setUTCDate(last.getUTCDate() - 1);
      return {
        from: dateStringInTz(startOfLastMonthInTz(timezone), timezone),
        to: dateStringInTz(last, timezone),
      };
    }
    case "last7":
      return { from: daysAgo(6), to: today };
    case "last30":
      return { from: daysAgo(29), to: today };
    case "year":
      return { from: dateStringInTz(startOfYearInTz(timezone), timezone), to: today };
    default:
      return null;
  }
}

export type ReportRange = {
  from: string;
  to: string;
  timezone: string;
  fromDate: Date;
  toDateExclusive: Date;
};

/**
 * Turn user input into a validated window.
 *
 * Defaults to the current month when `from`/`to` are missing. `to` is the last
 * day the user wants included; the returned `toDateExclusive` is the start of
 * the following day so a single-day report cannot leak tomorrow's rows.
 */
export function resolveReportRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  timezone: string = "Asia/Karachi",
): ReportRange {
  const today = todayDateStringInTz(timezone);
  const from = fromRaw?.trim() || today;
  const to = toRaw?.trim() || today;

  const fromDate = startOfDayInTz(from, timezone);
  const toDate = startOfDayInTz(to, timezone);

  if (!fromDate || !toDate) {
    throw new BadRequestError("api.report.invalidDate", { from, to });
  }
  if (fromDate.getTime() > toDate.getTime()) {
    throw new BadRequestError("api.report.invalidRange", { from, to });
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const dayNumber = (value: string): number => {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    return Math.floor(Date.UTC(year, month - 1, day) / dayMs);
  };
  const days = dayNumber(to) - dayNumber(from) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestError("api.report.rangeTooLong", {
      max: MAX_RANGE_DAYS,
      days,
    });
  }

  // Start of the day AFTER `to`, computed in the business timezone. Work on
  // the calendar date itself — adding 24h to a TZ-midnight Date can land on
  // the same calendar day after formatting.
  const [toYear, toMonth, toDay] = to.split("-").map(Number) as [number, number, number];
  const nextCalendarDay = new Date(Date.UTC(toYear, toMonth - 1, toDay + 1));
  const nextDayString = `${nextCalendarDay.getUTCFullYear()}-${String(
    nextCalendarDay.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(nextCalendarDay.getUTCDate()).padStart(2, "0")}`;
  const toDateExclusive = startOfDayInTz(nextDayString, timezone);
  if (!toDateExclusive) {
    throw new BadRequestError("api.report.invalidDate", { from, to });
  }

  return { from, to, timezone, fromDate, toDateExclusive };
}

/**
 * Count sale lines in the window whose cost resolves to zero. Those lines make
 * gross profit look better than it is, so the report says so explicitly.
 */
async function countLinesWithoutCost(
  userId: string,
  from: Date,
  toExclusive: Date,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM "SaleItem" si
    JOIN "Sale" s ON si."saleId" = s.id
    LEFT JOIN "StockMove" sm ON si."stockMoveId" = sm.id
    LEFT JOIN "Product" p ON si."productId" = p.id
    WHERE s."voidedAt" IS NULL
      AND s."userId" = ${userId}
      AND s."date" >= ${from}
      AND s."date" < ${toExclusive}
      AND COALESCE(sm."unitCost", p."purchasePrice", 0) <= 0
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function getReport(
  userId: string,
  range: ReportRange,
): Promise<ReportData> {
  const { from, to, timezone, fromDate, toDateExclusive } = range;
  const dateFilter = { gte: fromDate, lt: toDateExclusive };

  const [
    profit,
    paymentAgg,
    purchaseAgg,
    supplierPaymentAgg,
    expenseGroups,
    receivablesList,
    suppliersList,
    products,
    topRows,
    missingCostLines,
  ] = await Promise.all([
    getProfitLossRange(userId, fromDate, toDateExclusive),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { userId, voidedAt: null, date: dateFilter },
    }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true, paidAmount: true },
      _count: { _all: true },
      where: { userId, voidedAt: null, date: dateFilter },
    }),
    prisma.supplierPayment.aggregate({
      _sum: { amount: true },
      where: { userId, voidedAt: null, date: dateFilter },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      _sum: { amount: true },
      _count: { _all: true },
      where: { userId, voidedAt: null, date: dateFilter },
      orderBy: { _sum: { amount: "desc" } },
    }),
    listOutstandingCustomers(userId),
    listSuppliersWithBalance(userId),
    listProductsWithStock(userId),
    prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, total: true },
      where: {
        sale: { userId, voidedAt: null, date: dateFilter },
      },
      orderBy: { _sum: { total: "desc" } },
      take: 8,
    }),
    countLinesWithoutCost(userId, fromDate, toDateExclusive),
  ]);

  const cashReceived = toDecimalOrZero(paymentAgg._sum.amount);

  const purchasesBilled = toDecimalOrZero(purchaseAgg._sum.totalAmount);
  const purchasesPaidAtPurchase = toDecimalOrZero(purchaseAgg._sum.paidAmount);
  const supplierPayments = toDecimalOrZero(supplierPaymentAgg._sum.amount);
  const cashPaidToSuppliers = purchasesPaidAtPurchase.plus(supplierPayments);

  const expenseTotal = expenseGroups.reduce(
    (sum, row) => sum.plus(toDecimalOrZero(row._sum.amount)),
    new Decimal(0),
  );
  const expenseCount = expenseGroups.reduce(
    (sum, row) => sum + Number(row._count._all ?? 0),
    0,
  );
  const byCategory: ReportExpenseCategory[] = expenseGroups.map((row) => ({
    category: row.category,
    amount: toDecimalOrZero(row._sum.amount).toString(),
    count: Number(row._count._all ?? 0),
  }));

  const receivables = receivablesList.reduce(
    (sum, c) => sum.plus(toDecimalOrZero(c.balance)),
    new Decimal(0),
  );
  const payables = suppliersList.reduce(
    (sum, s) => sum.plus(new Decimal(s.balance).gt(0) ? s.balance : 0),
    new Decimal(0),
  );
  const stockValue = products.reduce(
    (sum, p) => sum.plus(new Decimal(p.currentStock).times(p.purchasePrice)),
    new Decimal(0),
  );

  // Product names for the top rows, in one query (no N+1).
  const productIds = topRows.map((row) => row.productId);
  const productDetails =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds }, userId },
          select: { id: true, name: true, unit: true },
        })
      : [];
  const productMap = new Map(productDetails.map((p) => [p.id, p]));

  const topProducts: ReportTopProduct[] = topRows
    .map((row) => {
      const product = productMap.get(row.productId);
      if (!product) return null;
      return {
        productId: row.productId,
        name: product.name,
        unit: product.unit,
        quantity: toDecimalOrZero(row._sum.quantity).toString(),
        revenue: toDecimalOrZero(row._sum.total).toString(),
      };
    })
    .filter((row): row is ReportTopProduct => row !== null);

  const revenue = new Decimal(profit.revenue);
  const cogs = new Decimal(profit.cogs);
  const limitations: ReportLimitation[] = [
    { key: "reports.limit.cogs" },
    { key: "reports.limit.recordedExpenses" },
    { key: "reports.limit.position" },
    { key: "reports.limit.invoiced" },
  ];
  if (expenseCount === 0) {
    limitations.push({ key: "reports.limit.noExpenses" });
  }
  if (missingCostLines > 0) {
    limitations.push({
      key: "reports.limit.missingCost",
      params: { count: missingCostLines },
    });
  }
  if (revenue.gt(0) && cogs.eq(0)) {
    limitations.push({ key: "reports.limit.noCostData" });
  }

  return {
    from,
    to,
    timezone,
    sales: {
      billed: profit.revenue,
      cashReceived: cashReceived.toString(),
      count: profit.salesCount,
    },
    purchases: {
      billed: purchasesBilled.toString(),
      cashPaid: cashPaidToSuppliers.toString(),
      count: Number(purchaseAgg._count._all ?? 0),
    },
    expenses: {
      total: expenseTotal.toString(),
      count: expenseCount,
      byCategory,
    },
    profit,
    position: {
      receivables: receivables.toString(),
      receivablesCount: receivablesList.length,
      payables: payables.toString(),
      payablesCount: suppliersList.filter((s) => new Decimal(s.balance).gt(0)).length,
      stockValue: stockValue.toDecimalPlaces(2).toString(),
      stockProducts: products.length,
    },
    topProducts,
    limitations,
  };
}

/**
 * Convenience wrapper used by the API route: validate + compute in one call.
 */
export async function getReportForRange(
  userId: string,
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  timezone: string = "Asia/Karachi",
): Promise<ReportData> {
  const range = resolveReportRange(fromRaw, toRaw, timezone);
  return getReport(userId, range);
}

/**
 * Compute a report for a named preset (today, week, month, …). Throws when
 * the preset is not one we know, so the caller can surface a clear error
 * instead of silently reporting the wrong window.
 */
export async function getReportForPreset(
  userId: string,
  preset: string,
  timezone: string = "Asia/Karachi",
): Promise<ReportData> {
  const resolved = rangeForPreset(preset, timezone);
  if (!resolved) {
    throw new BadRequestError("api.report.invalidPreset", { preset });
  }
  return getReportForRange(userId, resolved.from, resolved.to, timezone);
}

/** Current-month range, used as the default when the page first loads. */
export function currentMonthRange(timezone: string = "Asia/Karachi"): {
  from: string;
  to: string;
} {
  return {
    from: dateStringInTz(startOfMonthInTz(timezone), timezone),
    to: todayDateStringInTz(timezone),
  };
}

// Re-exported for callers that only need the shape.
export type { ProfitLossPeriod };
