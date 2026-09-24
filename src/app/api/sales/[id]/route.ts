/**
 * /api/sales/[id]
 *
 * GET    → fetch one sale with items
 * POST   → void a sale (preferred over deleting; sets voidedAt on sale + linked payments)
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest } from "next/server";
import { getSale, voidSale } from "@/lib/services/sales";
import { ok, fail } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId(req);
    const sale = await getSale(id, userId);
    return ok(sale);
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
    const userId = await getCurrentUserId(req);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "void") {
      const result = await voidSale(id, userId);
      return ok(result);
    }

    return fail(new Error("Unknown action. Use ?action=void to void a sale."));
  } catch (error) {
    return fail(error);
  }
}
