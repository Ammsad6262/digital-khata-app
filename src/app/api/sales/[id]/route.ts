/**
 * /api/sales/[id]
 *
 * GET    → fetch one sale with items
 * POST   → void a sale (preferred over deleting; sets voidedAt on sale + linked payments)
 */

import { NextRequest } from "next/server";
import { getSale, voidSale } from "@/lib/services/sales";
import { ok, fail } from "@/lib/utils/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const sale = await getSale(params.id);
    return ok(sale);
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
      const result = await voidSale(params.id);
      return ok(result);
    }

    return fail(new Error("Unknown action. Use ?action=void to void a sale."));
  } catch (error) {
    return fail(error);
  }
}
