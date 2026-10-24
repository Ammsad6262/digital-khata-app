/**
 * POST /api/products/with-opening-stock
 *
 * V6 (Smart Entry): Create a product AND optionally an opening-batch StockMove
 * in a single atomic database transaction.
 *
 * Body: same shape as POST /api/products, BUT the `openingStock` field is
 * interpreted as "create an opening-batch StockMove of this quantity" rather
 * than "set the Product.openingStock migration column". This is the key
 * difference that makes the new product immediately batch-trackable.
 *
 * Response 201: { product, stockMove }
 *
 * Security:
 *   - userId is taken from the JWT cookie (requireUserId) — NEVER from
 *     the request body.
 *   - All input is validated via createProductSchema (Zod).
 *   - SKU uniqueness is enforced by the database. Prisma P2002 → 409 Conflict.
 */

import { NextRequest } from "next/server";
import { createProductWithOpeningStock } from "@/lib/services/products";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { tServer } from "@/lib/i18n/server";
import { requireUserId } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) {
      return fail(new Error(error || tServer("api.errors.invalidBody")));
    }

    const result = await createProductWithOpeningStock(data, userId);
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
