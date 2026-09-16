/**
 * /api/payments/[id]
 *
 * GET    → fetch one payment with customer info (404 if not found / voided)
 * POST   → void a payment (preferred over deleting)
 */

import { NextRequest } from "next/server";
import { getPayment, voidPayment } from "@/lib/services/payments";
import { ok, fail } from "@/lib/utils/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const payment = await getPayment(params.id);
    return ok(payment);
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
      const result = await voidPayment(params.id);
      return ok(result);
    }

    return fail(new Error("Unknown action. Use ?action=void to void a payment."));
  } catch (error) {
    return fail(error);
  }
}
