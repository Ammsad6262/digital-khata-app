/**
 * Expense service layer.
 *
 * Expenses are business expenses (transport, electricity, etc.). They do
 * NOT affect any customer's balance — there is no FK from Expense to Customer.
 */

import { prisma } from "@/lib/db/prisma";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { createExpenseSchema } from "@/lib/schemas/expense";
import type { Prisma } from "@prisma/client";

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

/** List recent expenses (default: last 50, active only). */
export async function listExpenses(limit = 50): Promise<ExpenseView[]> {
  const expenses = await prisma.expense.findMany({
    where: { voidedAt: null },
    orderBy: { date: "desc" },
    take: limit,
  });
  return expenses.map(toView);
}

/** Record an expense — atomic with the Transaction ledger row. */
export async function recordExpense(input: unknown): Promise<ExpenseView> {
  const data = createExpenseSchema.parse(input);

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        name: data.name,
        amount: data.amount,
        category: data.category,
        notes: data.notes ?? null,
        date: data.date ? new Date(data.date) : new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        type: "expense",
        refType: "Expense",
        refId: created.id,
        amount: data.amount,
        direction: "debit", // business cash ↓
        date: created.date,
      },
    });

    return created;
  });

  return toView(expense);
}

/** Void an expense. */
export async function voidExpense(id: string): Promise<{ id: string; voidedAt: Date }> {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw new NotFoundError("Expense", id);
  if (expense.voidedAt) throw new BadRequestError("Expense is already voided.");

  const now = new Date();
  await prisma.expense.update({
    where: { id },
    data: { voidedAt: now },
  });

  return { id, voidedAt: now };
}
