/**
 * /api/products/[id]/batches
 *
 * GET → list all available purchase batches for a product, sorted OLDEST first
 *      (FIFO-friendly).
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest } from "next/server";
import { listProductBatches } from "@/lib/services/stock";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const batches = await listProductBatches(id);
    return ok(batches);
  } catch (error) {
    return fail(error);
  }
}
