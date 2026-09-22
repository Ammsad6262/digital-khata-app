/**
 * /api/products/[id]
 *
 * GET    → fetch one product with current stock
 * PATCH  → update a product
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest } from "next/server";
import { getProductWithStock, updateProduct } from "@/lib/services/products";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const product = await getProductWithStock(id);
    return ok(product);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const product = await updateProduct(id, data);
    return ok(product);
  } catch (error) {
    return fail(error);
  }
}
