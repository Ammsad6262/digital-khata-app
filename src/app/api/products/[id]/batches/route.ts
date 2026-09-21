/**
 * /api/products/[id]/batches
 *
 * GET → list all available purchase batches for a product, sorted OLDEST first
 *      (FIFO-friendly). Each batch includes:
 *        - id (StockMove.id)
 *        - date (when this batch was purchased/added)
 *        - quantity (original batch size)
 *        - remainingQuantity (how much is still in stock from this batch)
 *        - unitCost (purchase cost per unit — may be null for returns)
 *        - type ("purchase" | "return")
 *        - reason (optional note)
 *
 * Used by the New Sale form's batch picker.
 *
 * Returns 200 with an array (possibly empty if no batches / product not found).
 * Returns 404 only if the product itself doesn't exist.
 */

import { NextRequest } from "next/server";
import { listProductBatches } from "@/lib/services/stock";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const batches = await listProductBatches(params.id);
    return ok(batches);
  } catch (error) {
    return fail(error);
  }
}
