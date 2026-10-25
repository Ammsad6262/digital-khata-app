/**
 * /api/suppliers/[id]/payments
 *
 * GET  → payments made to this supplier (newest first)
 * POST → record a payment to this supplier
 */

import { NextRequest } from "next/server";
import {
  listSupplierPayments,
  createSupplierPayment,
} from "@/lib/services/supplier-payments";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const data = await listSupplierPayments(id, userId);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const body =
      data && typeof data === "object"
        ? { ...(data as Record<string, unknown>), supplierId: id }
        : { supplierId: id };

    const payment = await createSupplierPayment(body, userId);
    return ok(payment, 201);
  } catch (error) {
    return fail(error);
  }
}
