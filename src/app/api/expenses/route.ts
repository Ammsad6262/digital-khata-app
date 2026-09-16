/**
 * /api/expenses
 *
 * GET  → list recent expenses
 * POST → record an expense (atomic: Expense + Transaction ledger)
 */

import { NextRequest } from "next/server";
import { listExpenses, recordExpense } from "@/lib/services/expenses";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET() {
  try {
    const data = await listExpenses(50);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const expense = await recordExpense(data);
    return ok(expense, 201);
  } catch (error) {
    return fail(error);
  }
}
