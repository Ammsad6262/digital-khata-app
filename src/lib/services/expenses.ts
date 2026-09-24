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
import {
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
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

export type ExpenseFilter = "today" | "week" | "month" | "all";

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
  let startDate: Date | undefined;

  switch (filter) {
    case "today": startDate = startOfTodayInTz(timezone); break;
    case "week":  startDate = startOfWeekInTz(timezone); break;
    case "month": startDate = startOfMonthInTz(timezone); break;
    case "all":   startDate = undefined; break;
  }

  const expenses = await prisma.expense.findMany({
    where: {
      voidedAt: null,
      ...(userId && { userId }),
      ...(startDate && { date: { gte: startDate } }),
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
    throw new NotFoundError("Expense", id);
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

  return toView(updated);
}

/** Void an expense — atomic + cleans up the Transaction mirror. */
export async function voidExpense(id: string, userId?: string | null): Promise<{ id: string; voidedAt: Date }> {
  const result = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({ where: { id, ...(userId && { userId }) } });
    if (!expense) throw new NotFoundError("Expense", id);
    if (expense.voidedAt) throw new BadRequestError("Expense is already voided.");

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

  return result;
}
