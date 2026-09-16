/**
 * /api/products/[id]
 *
 * GET    → fetch one product with current stock
 * PATCH  → update a product
 */

import { NextRequest } from "next/server";
import { getProductWithStock, updateProduct } from "@/lib/services/products";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const product = await getProductWithStock(params.id);
    return ok(product);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const product = await updateProduct(params.id, data);
    return ok(product);
  } catch (error) {
    return fail(error);
  }
}
