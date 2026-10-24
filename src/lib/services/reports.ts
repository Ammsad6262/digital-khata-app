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
 *   Sales billed        = SUM(Sale.totalAmount) for active sales (net of discount)
 *   Discounts given     = SUM(Sale.discountAmount) in the window
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
import { getOverdueSummary } from "@/lib/services/sales";
import { computeStockValuation } from "@/lib/utils/stock-valuation";

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

export type ReportFollowUps = {
  total: number;
  pending: number;
  contacted: number;
  interested: number;
  orderPlaced: number;
  notInterested: number;
  noResponse: number;
  /** Outcomes recorded (resolvedAt) inside the selected window. */
  resolved: number;
};

export type ReportPaymentMethod = {
  method: string;
  amount: string;
  count: number;
};

export type ReportCustomerSales = {
  customerId: string;
  name: string;
  billed: string;
  count: number;
};

export type ReportSupplierPurchases = {
  supplierId: string;
  name: string;
  billed: string;
  paidAtPurchase: string;
  supplierPayments: string;
  count: number;
};

export type ReportCustomerBalance = {
  id: string;
  name: string;
  phone: string | null;
  balance: string;
};

export type ReportSupplierBalance = {
  id: string;
  name: string;
  phone: string | null;
  balance: string;
};

export type ReportLowStockProduct = {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  lowStockThreshold: number;
};

/**
 * Same-length window immediately before the selected one. Percent changes are
 * null when the previous window had no figure to compare against — we never
 * invent a percentage from a zero baseline.
 */
export type ReportComparison = {
  from: string;
  to: string;
  salesBilled: string;
  cashReceived: string;
  purchasesBilled: string;
  expenses: string;
  netProfit: string;
  changes: {
    salesPct: string | null;
    cashPct: string | null;
    purchasesPct: string | null;
    expensesPct: string | null;
    netProfitPct: string | null;
  };
};

export type ReportData = {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  timezone: string;
  sales: {
    billed: string;
    /** Discounts given in the window (already subtracted from billed). */
    discounts: string;
    cashReceived: string;
    count: number;
    /** Customers with the highest billed value in the window. */
    byCustomer: ReportCustomerSales[];
  };
  purchases: {
    billed: string;
    cashPaid: string;
    count: number;
    /** Suppliers with the highest billed value in the window. */
    bySupplier: ReportSupplierPurchases[];
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
    /** Products with stock but no purchase price — left out of stockValue. */
    stockNotValued: number;
    /** Receivable amount whose agreed date has passed (as of today). */
    overdue: string;
    overdueSalesCount: number;
    overdueCustomersCount: number;
  };
  topProducts: ReportTopProduct[];
  followUps: ReportFollowUps;
  /** Payment methods used by customers in the selected window. */
  collections: {
    byMethod: ReportPaymentMethod[];
  };
  /** Same-length window immediately before the selected one. */
  comparison: ReportComparison;
  /** Point-in-time balances, highest first. */
  balances: {
    customers: ReportCustomerBalance[];
    suppliers: ReportSupplierBalance[];
  };
  /** Products at or below their low-stock threshold, lowest first. */
  lowStock: ReportLowStockProduct[];
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

/** Calendar-day number for a YYYY-MM-DD string, independent of timezone. */
function calendarDayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Add calendar days to a YYYY-MM-DD string without timezone drift. */
function addCalendarDays(value: string, delta: number): string {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Percent change from the previous window. Null when there is no baseline —
 * a zero-to-something move is not a percentage the owner should trust.
 */
function percentChange(current: Decimal, previous: Decimal): string | null {
  if (previous.eq(0)) return null;
  return current
    .minus(previous)
    .div(previous.abs())
    .times(100)
    .toDecimalPlaces(1)
    .toString();
}

export async function getReport(
  userId: string,
  range: ReportRange,
): Promise<ReportData> {
  const { from, to, timezone, fromDate, toDateExclusive } = range;
  const dateFilter = { gte: fromDate, lt: toDateExclusive };

  // Previous window of exactly the same number of calendar days. Its end is
  // the start of the current window, so the two windows never overlap.
  const days = calendarDayNumber(to) - calendarDayNumber(from) + 1;
  const previousTo = addCalendarDays(from, -1);
  const previousFrom = addCalendarDays(previousTo, -(days - 1));
  const previousFromDate = startOfDayInTz(previousFrom, timezone);
  if (!previousFromDate) {
    throw new BadRequestError("api.report.invalidDate", { from, to });
  }
  const previousDateFilter = { gte: previousFromDate, lt: fromDate };

  const [
    profit,
    paymentAgg,
    paymentMethodGroups,
    saleCustomerGroups,
    purchaseSupplierGroups,
    supplierPaymentBySupplier,
    discountAgg,
    purchaseAgg,
    supplierPaymentAgg,
    expenseGroups,
    receivablesList,
    suppliersList,
    products,
    overdueSummary,
    topRows,
    missingCostLines,
    followUpGroups,
    followUpResolved,
    previousProfit,
    previousPaymentAgg,
    previousPurchaseAgg,
    previousExpenseAgg,
  ] = await Promise.all([
    getProfitLossRange(userId, fromDate, toDateExclusive),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { userId, voidedAt: null, date: dateFilter },
    }),
    prisma.payment.groupBy({
      by: ["method"],
      _sum: { amount: true },
      _count: { _all: true },
      where: { userId, voidedAt: null, date: dateFilter },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prisma.sale.groupBy({
      by: ["customerId"],
      _sum: { totalAmount: true },
      _count: { _all: true },
      where: { userId, voidedAt: null, date: dateFilter },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 10,
    }),
    prisma.purchase.groupBy({
      by: ["supplierId"],
      _sum: { totalAmount: true, paidAmount: true },
      _count: { _all: true },
      where: { userId, voidedAt: null, date: dateFilter },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 10,
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId"],
      _sum: { amount: true },
      where: { userId, voidedAt: null, date: dateFilter },
    }),
    prisma.sale.aggregate({
      _sum: { discountAmount: true },
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
    getOverdueSummary(userId),
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
    prisma.followUp.groupBy({
      by: ["outcome"],
      _count: { _all: true },
      where: { userId, createdAt: dateFilter },
    }),
    prisma.followUp.count({
      where: { userId, resolvedAt: dateFilter },
    }),
    getProfitLossRange(userId, previousFromDate, fromDate),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { userId, voidedAt: null, date: previousDateFilter },
    }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true },
      where: { userId, voidedAt: null, date: previousDateFilter },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { userId, voidedAt: null, date: previousDateFilter },
    }),
  ]);

  const cashReceived = toDecimalOrZero(paymentAgg._sum.amount);
  const discountsGiven = toDecimalOrZero(discountAgg._sum.discountAmount);

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
  const stock = computeStockValuation(products);

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

  // Customer-wise sales for the period (top 10 by billed value).
  const saleCustomerIds = saleCustomerGroups.map((row) => row.customerId);
  const saleCustomers =
    saleCustomerIds.length > 0
      ? await prisma.customer.findMany({
          where: { id: { in: saleCustomerIds }, userId },
          select: { id: true, name: true },
        })
      : [];
  const customerNameMap = new Map(saleCustomers.map((customer) => [customer.id, customer.name]));
  const salesByCustomer: ReportCustomerSales[] = saleCustomerGroups.map((row) => ({
    customerId: row.customerId,
    name: customerNameMap.get(row.customerId) ?? "—",
    billed: toDecimalOrZero(row._sum.totalAmount).toString(),
    count: Number(row._count._all ?? 0),
  }));

  // Supplier-wise purchases for the period (top 10 by billed value).
  const purchaseSupplierIds = purchaseSupplierGroups.map((row) => row.supplierId);
  const purchaseSuppliers =
    purchaseSupplierIds.length > 0
      ? await prisma.supplier.findMany({
          where: { id: { in: purchaseSupplierIds }, userId },
          select: { id: true, name: true },
        })
      : [];
  const supplierNameMap = new Map(
    purchaseSuppliers.map((supplier) => [supplier.id, supplier.name]),
  );
  const supplierPaymentMap = new Map(
    supplierPaymentBySupplier.map((row) => [
      row.supplierId,
      toDecimalOrZero(row._sum.amount),
    ]),
  );
  const purchasesBySupplier: ReportSupplierPurchases[] = purchaseSupplierGroups.map((row) => ({
    supplierId: row.supplierId,
    name: supplierNameMap.get(row.supplierId) ?? "—",
    billed: toDecimalOrZero(row._sum.totalAmount).toString(),
    paidAtPurchase: toDecimalOrZero(row._sum.paidAmount).toString(),
    supplierPayments: (supplierPaymentMap.get(row.supplierId) ?? new Decimal(0)).toString(),
    count: Number(row._count._all ?? 0),
  }));

  const followUpCount = (outcome: string): number =>
    Number(followUpGroups.find((row) => row.outcome === outcome)?._count._all ?? 0);
  const followUps: ReportFollowUps = {
    total: followUpGroups.reduce(
      (sum, row) => sum + Number(row._count._all ?? 0),
      0,
    ),
    pending: followUpCount("pending"),
    contacted: followUpCount("contacted"),
    interested: followUpCount("interested"),
    orderPlaced: followUpCount("order_placed"),
    notInterested: followUpCount("not_interested"),
    noResponse: followUpCount("no_response"),
    resolved: followUpResolved,
  };

  const collectionsByMethod: ReportPaymentMethod[] = paymentMethodGroups.map((row) => ({
    method: row.method,
    amount: toDecimalOrZero(row._sum.amount).toString(),
    count: Number(row._count._all ?? 0),
  }));

  const customerBalances: ReportCustomerBalance[] = receivablesList
    .filter((customer) => new Decimal(customer.balance).gt(0))
    .sort((a, b) => new Decimal(b.balance).cmp(new Decimal(a.balance)))
    .slice(0, 10)
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      balance: customer.balance,
    }));

  const supplierBalances: ReportSupplierBalance[] = suppliersList
    .filter((supplier) => new Decimal(supplier.balance).gt(0))
    .sort((a, b) => new Decimal(b.balance).cmp(new Decimal(a.balance)))
    .slice(0, 10)
    .map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      balance: supplier.balance,
    }));

  const lowStock: ReportLowStockProduct[] = products
    .filter((product) => product.isLowStock)
    .sort((a, b) => new Decimal(a.currentStock).cmp(new Decimal(b.currentStock)))
    .slice(0, 10)
    .map((product) => ({
      id: product.id,
      name: product.name,
      unit: product.unit,
      currentStock: product.currentStock,
      lowStockThreshold: product.lowStockThreshold,
    }));

  const previousSales = new Decimal(previousProfit.revenue);
  const previousCash = toDecimalOrZero(previousPaymentAgg._sum.amount);
  const previousPurchases = toDecimalOrZero(previousPurchaseAgg._sum.totalAmount);
  const previousExpenses = toDecimalOrZero(previousExpenseAgg._sum.amount);
  const previousNet = new Decimal(previousProfit.netProfit);
  const comparison: ReportComparison = {
    from: previousFrom,
    to: previousTo,
    salesBilled: previousSales.toString(),
    cashReceived: previousCash.toString(),
    purchasesBilled: previousPurchases.toString(),
    expenses: previousExpenses.toString(),
    netProfit: previousNet.toString(),
    changes: {
      salesPct: percentChange(new Decimal(profit.revenue), previousSales),
      cashPct: percentChange(cashReceived, previousCash),
      purchasesPct: percentChange(purchasesBilled, previousPurchases),
      expensesPct: percentChange(expenseTotal, previousExpenses),
      netProfitPct: percentChange(new Decimal(profit.netProfit), previousNet),
    },
  };

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
  if (stock.unvaluedProducts > 0) {
    limitations.push({
      key: "reports.limit.stockValuation",
      params: { count: stock.unvaluedProducts },
    });
  }
  if (discountsGiven.gt(0)) {
    limitations.push({ key: "reports.limit.discounts" });
  }
  if (payables.gt(0)) {
    limitations.push({ key: "reports.limit.payablesNoDueDate" });
  }

  return {
    from,
    to,
    timezone,
    sales: {
      billed: profit.revenue,
      discounts: discountsGiven.toString(),
      cashReceived: cashReceived.toString(),
      count: profit.salesCount,
      byCustomer: salesByCustomer,
    },
    purchases: {
      billed: purchasesBilled.toString(),
      cashPaid: cashPaidToSuppliers.toString(),
      count: Number(purchaseAgg._count._all ?? 0),
      bySupplier: purchasesBySupplier,
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
      stockValue: stock.value,
      stockProducts: stock.productsWithStock,
      stockNotValued: stock.unvaluedProducts,
      overdue: overdueSummary.total,
      overdueSalesCount: overdueSummary.salesCount,
      overdueCustomersCount: overdueSummary.customersCount,
    },
    topProducts,
    followUps,
    collections: {
      byMethod: collectionsByMethod,
    },
    comparison,
    balances: {
      customers: customerBalances,
      suppliers: supplierBalances,
    },
    lowStock,
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
