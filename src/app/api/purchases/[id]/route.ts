/**
 * /api/purchases/[id]
 *
 * GET    → fetch one purchase
 * DELETE → void a purchase (removes the stock it added; blocked if sold)
 */

import { NextRequest } from "next/server";
import { getPurchase, voidPurchase } from "@/lib/services/purchases";
import { ok, fail } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const purchase = await getPurchase(id, userId);
    return ok(purchase);
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
    const result = await voidPurchase(id, userId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
