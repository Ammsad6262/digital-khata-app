/**
 * Expense service layer.
 *
 * Expenses are business expenses (transport, electricity, packaging, etc.).
 * They DO NOT affect any customer's balance — there is no FK from Expense
 * to Customer. This is enforced at the schema level.
 *
 * They DO NOT affect stock. (Stock changes happen only via Sale or StockMove.)
 *
 * Data-integrity rules:
 *   - Voiding is preferred over hard-delete (sets voidedAt, preserves audit trail)
 *   - Editing is allowed in V1 — updates name, amount, category, notes, date
 *   - Dashboard 'today's expenses' uses SUM(amount WHERE voidedAt IS NULL
 *     AND date >= start of today in business TZ) — same source of truth
 */

import { prisma } from "@/lib/db/prisma";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { createExpenseSchema } from "@/lib/schemas/expense";
import { invalidateCache } from "@/lib/utils/cache";
import { recordAudit } from "@/lib/services/audit";
import { Decimal } from "@/lib/utils/decimal";
import {
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
  getDateRangeForFilter,
} from "@/lib/utils/date";
import type { Prisma } from "@prisma/client";

// ────────────────────────────────────────────────────────────────────────────
// View types
// ────────────────────────────────────────────────────────────────────────────

export type ExpenseView = {
  id: string;
  name: string;
  amount: string;
  category: string;
  notes: string | null;
  date: Date;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExpenseFilter = "today" | "yesterday" | "week" | "lastWeek" | "month" | "lastMonth" | "year" | "all";

// ────────────────────────────────────────────────────────────────────────────
// Mappers
// ────────────────────────────────────────────────────────────────────────────

function toView(e: Prisma.ExpenseGetPayload<{}>): ExpenseView {
  return {
    id: e.id,
    name: e.name,
    amount: e.amount.toString(),
    category: e.category,
    notes: e.notes,
    date: e.date,
    voidedAt: e.voidedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// List + detail
// ────────────────────────────────────────────────────────────────────────────

/** List recent expenses (default: last 50, active only). */
export async function listExpenses(limit = 50, userId?: string | null): Promise<ExpenseView[]> {
  const expenses = await prisma.expense.findMany({
    where: { voidedAt: null, ...(userId && { userId }) },
    orderBy: { date: "desc" },
    take: limit,
  });
  return expenses.map(toView);
}

/**
 * List expenses with date filtering.
 *
 * Filter:
 *   today → expenses where date >= start of today (in business TZ)
 *   week  → expenses where date >= start of week (Monday)
 *   month → expenses where date >= start of month
 *   all   → no date filter (still excludes voided)
 */
export async function listExpensesFiltered(
  filter: ExpenseFilter = "all",
  options: {
    limit?: number;
    timezone?: string;
  } = {},
  userId?: string | null,
): Promise<ExpenseView[]> {
  const { limit = 200, timezone = "Asia/Karachi" } = options;
  const range = getDateRangeForFilter(filter, timezone);

  const expenses = await prisma.expense.findMany({
    where: {
      voidedAt: null,
      ...(userId && { userId }),
      ...((range.start || range.end) && {
        date: {
          ...(range.start && { gte: range.start }),
          ...(range.end && { lt: range.end }),
        },
      }),
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  return expenses.map(toView);
}

/** Fetch one expense. */
export async function getExpense(id: string, userId?: string | null): Promise<ExpenseView> {
  const expense = await prisma.expense.findFirst({ where: { id, ...(userId && { userId }) } });
  if (!expense || expense.voidedAt) {
    throw new NotFoundError("api.resource.expense", id);
  }
  return toView(expense);
}

// ────────────────────────────────────────────────────────────────────────────
// Create + update + void
// ────────────────────────────────────────────────────────────────────────────

/** Record an expense — atomic with the Transaction ledger row. */
export async function recordExpense(input: unknown, userId?: string | null): Promise<ExpenseView> {
  const data = createExpenseSchema.parse(input);

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        ...(userId && { userId }),
        name: data.name,
        amount: data.amount,
        category: data.category,
        notes: data.notes ?? null,
        date: data.date ? new Date(data.date) : new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        ...(userId && { userId }),
        type: "expense",
        refType: "Expense",
        refId: created.id,
        amount: data.amount,
        direction: "debit", // business cash ↓ (no customer link)
        date: created.date,
      },
    });

    return created;
  });

  invalidateCache("dashboard");
  invalidateCache("profit-loss");

  if (userId) {
    await recordAudit(userId, {
      action: "expense.create",
      entityType: "Expense",
      entityId: expense.id,
      summary: `Expense: ${expense.name}`,
      metadata: {
        amount: expense.amount.toString(),
        category: expense.category,
      },
    });
  }

  return toView(expense);
}

/**
 * Update an expense — name, amount, category, notes, date can all change.
 * Updates the Transaction ledger row's amount + date to stay in sync.
 */
export async function updateExpense(id: string, input: unknown, userId?: string | null): Promise<ExpenseView> {
  // Throws 404 if not found / voided / belongs to another tenant.
  await getExpense(id, userId);

  const data = createExpenseSchema.partial().parse(input);

  const updated = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
      },
    });

    // Keep the Transaction ledger row in sync.
    await tx.transaction.updateMany({
      where: { refType: "Expense", refId: id },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
      },
    });

    return expense;
  });

  invalidateCache("dashboard");
  invalidateCache("profit-loss");

  if (userId) {
    await recordAudit(userId, {
      action: "expense.update",
      entityType: "Expense",
      entityId: updated.id,
      summary: `Updated expense: ${updated.name}`,
      metadata: {
        amount: updated.amount.toString(),
        category: updated.category,
      },
    });
  }

  return toView(updated);
}

/** Void an expense — atomic + cleans up the Transaction mirror. */
export async function voidExpense(id: string, userId?: string | null): Promise<{ id: string; voidedAt: Date }> {
  const result = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({ where: { id, ...(userId && { userId }) } });
    if (!expense) throw new NotFoundError("api.resource.expense", id);
    if (expense.voidedAt) throw new BadRequestError("api.expense.alreadyVoided");

    const now = new Date();
    await tx.expense.update({
      where: { id },
      data: { voidedAt: now },
    });

    // Delete the Transaction ledger row for this expense.
    await tx.transaction.deleteMany({
      where: { refType: "Expense", refId: id },
    });

    return { id, voidedAt: now };
  });

  invalidateCache("dashboard");
  invalidateCache("profit-loss");

  if (userId) {
    await recordAudit(userId, {
      action: "expense.void",
      entityType: "Expense",
      entityId: id,
      summary: "Voided an expense",
      metadata: { voidedAt: result.voidedAt.toISOString() },
    });
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// V2 — Summary (totals + per-category breakdown)
// ────────────────────────────────────────────────────────────────────────────

export type ExpenseSummaryCategory = {
  category: string;
  total: string;
  count: number;
  // Percentage of grand total (0-100). Computed in JS (Decimal-safe) so
  // the UI doesn't have to do math.
  percentage: number;
};

export type ExpenseSummary = {
  /** Filter the summary was computed for (mirrors input). */
  filter: ExpenseFilter;
  /** Total amount across all (non-voided) expenses matching the filter. */
  total: string;
  /** Count of (non-voided) expenses matching the filter. */
  count: number;
  /**
   * Today's expenses total — independent of the selected filter, so the UI
   * can show "Today" + the filtered period side by side. Always computed in
   * the business timezone.
   */
  todayTotal: string;
  todayCount: number;
  /**
   * This month's expenses total — independent of the selected filter, so
   * the UI can show "This month" alongside the filter.
   */
  monthTotal: string;
  monthCount: number;
  /** Per-category breakdown for the selected filter. */
  byCategory: ExpenseSummaryCategory[];
};

/**
 * Compute a summary of expenses: total, count, today's total, this month's
 * total, and per-category breakdown. All amounts are decimal-safe (no float
 * math). Filtered to the authenticated user's expenses only.
 *
 * The summary is NOT cached (it depends on the filter + current time). The
 * UI is expected to fetch it via React Query with a reasonable staleTime.
 */
export async function getExpensesSummary(
  filter: ExpenseFilter = "all",
  options: { timezone?: string } = {},
  userId?: string | null,
): Promise<ExpenseSummary> {
  const { timezone = "Asia/Karachi" } = options;

  // Compute the start date for the selected filter (for the per-filter total
  // + per-category breakdown).
  let filterStartDate: Date | undefined;
  switch (filter) {
    case "today": filterStartDate = startOfTodayInTz(timezone); break;
    case "week":  filterStartDate = startOfWeekInTz(timezone); break;
    case "month": filterStartDate = startOfMonthInTz(timezone); break;
    case "all":   filterStartDate = undefined; break;
  }

  // Today's window — always shown regardless of selected filter.
  const todayStart = startOfTodayInTz(timezone);
  // This-month window — always shown regardless of selected filter.
  const monthStart = startOfMonthInTz(timezone);

  // Parallel queries — 3 separate SUM + COUNT aggregations + 1 grouped.
  // Doing them in parallel avoids serial round-trips.
  const [filterAgg, todayAgg, monthAgg, byCategoryAgg] = await Promise.all([
    // 1. Total + count for the selected filter
    prisma.expense.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        voidedAt: null,
        ...(userId && { userId }),
        ...(filterStartDate && { date: { gte: filterStartDate } }),
      },
    }),
    // 2. Today's total + count
    prisma.expense.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        voidedAt: null,
        ...(userId && { userId }),
        date: { gte: todayStart },
      },
    }),
    // 3. This month's total + count
    prisma.expense.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        voidedAt: null,
        ...(userId && { userId }),
        date: { gte: monthStart },
      },
    }),
    // 4. Per-category breakdown for the selected filter
    prisma.expense.groupBy({
      by: ["category"],
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        voidedAt: null,
        ...(userId && { userId }),
        ...(filterStartDate && { date: { gte: filterStartDate } }),
      },
      orderBy: { category: "asc" },
    }),
  ]);

  // ── Convert to decimal-safe strings + compute percentages ───────────────
  const filterTotal = toDecimalOrZero(filterAgg._sum.amount);
  const todayTotal = toDecimalOrZero(todayAgg._sum.amount);
  const monthTotal = toDecimalOrZero(monthAgg._sum.amount);

  const byCategory: ExpenseSummaryCategory[] = byCategoryAgg
    .map((row) => {
      const total = toDecimalOrZero(row._sum.amount);
      return {
        category: row.category,
        total: total.toString(),
        count: row._count._all,
        // Percentage: 0 if grand total is 0 (avoids div-by-zero)
        percentage: filterTotal.gt(0)
          ? Number(total.div(filterTotal).times(100).toFixed(1))
          : 0,
      };
    })
    // Sort by total descending (so the biggest category shows first in UI)
    .sort((a, b) => (new Decimal(b.total).gt(new Decimal(a.total)) ? 1 : -1));

  return {
    filter,
    total: filterTotal.toString(),
    count: filterAgg._count._all,
    todayTotal: todayTotal.toString(),
    todayCount: todayAgg._count._all,
    monthTotal: monthTotal.toString(),
    monthCount: monthAgg._count._all,
    byCategory,
  };
}

// Tiny helper — converts a Prisma Decimal | null to our Decimal utility (0
// if null). Keeps the summary code free of `?? 0` boilerplate.
function toDecimalOrZero(value: Prisma.Decimal | null): Decimal {
  if (!value) return new Decimal(0);
  return new Decimal(value.toString());
}
