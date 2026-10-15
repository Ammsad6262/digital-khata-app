import { NextRequest } from "next/server";
import { getPayment, voidPayment, updatePayment } from "@/lib/services/payments";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
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

/**
 * PATCH /api/payments/[id]
 *
 * Update a payment's amount / method / date / notes. The customer + saleId
 * are NOT editable (those identify the payment; if they need to change, the
 * owner should void + re-record).
 *
 * If the amount changes AND the payment is linked to a sale, the sale's
 * denormalized paidAmount + outstanding columns are recomputed atomically.
 *
 * Security:
 *   - userId from JWT cookie via requireActiveAccess
 *   - getPayment() throws 404 if not owned by this user / voided
 *   - All mutations happen in a single prisma.$transaction (atomic)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireActiveAccess(req);
    const { id } = await params;
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const payment = await updatePayment(id, data, userId);
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
    throw new BadRequestError("api.payment.unknownAction");
  } catch (error) {
    return fail(error);
  }
}
