/**
 * /api/payments/[id]
 *
 * GET    → fetch one payment with customer info (404 if not found / voided)
 * POST   → void a payment (preferred over deleting)
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest } from "next/server";
import { getPayment, voidPayment } from "@/lib/services/payments";
import { ok, fail } from "@/lib/utils/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payment = await getPayment(id);
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
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "void") {
      const result = await voidPayment(id);
      return ok(result);
    }

    return fail(new Error("Unknown action. Use ?action=void to void a payment."));
  } catch (error) {
    return fail(error);
  }
}
