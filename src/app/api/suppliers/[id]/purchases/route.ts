/**
 * /api/suppliers/[id]/purchases
 *
 * GET  → purchases for this supplier (newest first)
 * POST → record a purchase (adds stock to the chosen products)
 */

import { NextRequest } from "next/server";
import {
  listPurchasesBySupplier,
  createPurchase,
} from "@/lib/services/purchases";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const data = await listPurchasesBySupplier(id, userId);
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

    const purchase = await createPurchase(body, userId);
    return ok(purchase, 201);
  } catch (error) {
    return fail(error);
  }
}
