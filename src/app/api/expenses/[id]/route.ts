import { NextRequest } from "next/server";
import { getExpense, updateExpense, voidExpense } from "@/lib/services/expenses";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId(req);
    const { id } = await params;
    const expense = await getExpense(id, userId);
    return ok(expense);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId(req);
    const { id } = await params;
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));
    const expense = await updateExpense(id, data, userId);
    return ok(expense);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId(req);
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    if (action === "void") {
      const result = await voidExpense(id, userId);
      return ok(result);
    }
    return fail(new Error("Unknown action. Use ?action=void to void an expense."));
  } catch (error) {
    return fail(error);
  }
}
