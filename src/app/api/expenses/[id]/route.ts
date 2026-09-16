/**
 * /api/expenses/[id]
 *
 * GET    → fetch one expense (404 if not found / voided)
 * PATCH  → update an expense (name/amount/category/notes/date)
 * POST   → void an expense (preferred over hard-delete for audit trail)
 */

import { NextRequest } from "next/server";
import {
  getExpense,
  updateExpense,
  voidExpense,
} from "@/lib/services/expenses";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const expense = await getExpense(params.id);
    return ok(expense);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const expense = await updateExpense(params.id, data);
    return ok(expense);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "void") {
      const result = await voidExpense(params.id);
      return ok(result);
    }

    return fail(new Error("Unknown action. Use ?action=void to void an expense."));
  } catch (error) {
    return fail(error);
  }
}
