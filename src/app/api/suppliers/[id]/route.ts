/**
 * /api/suppliers/[id]
 *
 * GET    → fetch one supplier with their payable balance (404 if not owned)
 * PATCH  → update a supplier (openingBalance NOT updatable)
 * DELETE → soft-delete a supplier (blocked if purchases/payments exist)
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest } from "next/server";
import {
  getSupplier,
  getSupplierBalance,
  updateSupplier,
  deleteSupplier,
} from "@/lib/services/suppliers";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    // Ownership check happens inside getSupplier (404 if not owned).
    const supplier = await getSupplier(id, userId);
    const balance = await getSupplierBalance(id);
    return ok({ ...supplier, ...balance });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const supplier = await updateSupplier(id, data, userId);
    return ok(supplier);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const result = await deleteSupplier(id, userId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
