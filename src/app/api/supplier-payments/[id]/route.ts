/**
 * /api/supplier-payments/[id]
 *
 * GET    → fetch one supplier payment
 * DELETE → void a supplier payment (also removes its ledger row)
 */

import { NextRequest } from "next/server";
import {
  getSupplierPayment,
  voidSupplierPayment,
} from "@/lib/services/supplier-payments";
import { ok, fail } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireActiveAccess(req);
    const { id } = await params;
    const payment = await getSupplierPayment(id, userId);
    return ok(payment);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireActiveAccess(req);
    const { id } = await params;
    const result = await voidSupplierPayment(id, userId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
