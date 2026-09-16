/**
 * /api/products
 *
 * GET    /api/products             → list products (without stock)
 * GET    /api/products?withStock=1 → list products with current stock
 * POST   /api/products             → create a product
 */

import { NextRequest } from "next/server";
import {
  listProducts,
  listProductsWithStock,
  createProduct,
} from "@/lib/services/products";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const withStock = url.searchParams.get("withStock") === "1";

    const data = withStock
      ? await listProductsWithStock()
      : await listProducts();

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const product = await createProduct(data);
    return ok(product, 201);
  } catch (error) {
    return fail(error);
  }
}
