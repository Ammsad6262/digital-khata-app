/**
 * /api/expenses
 *
 * GET  /api/expenses                      → recent expenses (last 50)
 * GET  /api/expenses?filter=today|week|month|all → filtered list
 * POST /api/expenses                      → record an expense (atomic)
 */

import { NextRequest } from "next/server";
import {
  listExpenses,
  listExpensesFiltered,
  recordExpense,
  type ExpenseFilter,
} from "@/lib/services/expenses";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

const VALID_FILTERS: ExpenseFilter[] = ["today", "week", "month", "all"];

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const filterRaw = getQueryParam(req, "filter");

    // No filter → recent 50.
    if (!filterRaw) {
      const data = await listExpenses(50, userId);
      return ok(data);
    }

    const filter = VALID_FILTERS.includes(filterRaw as ExpenseFilter)
      ? (filterRaw as ExpenseFilter)
      : "all";

    const data = await listExpensesFiltered(filter, { limit: 200 }, userId);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const expense = await recordExpense(data, userId);
    return ok(expense, 201);
  } catch (error) {
    return fail(error);
  }
}
