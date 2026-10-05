import { NextRequest } from "next/server";
import { getPayment, voidPayment } from "@/lib/services/payments";
import { ok, fail } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireActiveAccess(req);
    const { id } = await params;
    const payment = await getPayment(id, userId);
    return ok(payment);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireActiveAccess(req);
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    if (action === "void") {
      const result = await voidPayment(id, userId);
      return ok(result);
    }
    return fail(new Error("Unknown action. Use ?action=void to void a payment."));
  } catch (error) {
    return fail(error);
  }
}
