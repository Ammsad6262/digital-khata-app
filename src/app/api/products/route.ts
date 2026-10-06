/**
 * /api/products
 *
 * GET  /api/products             → list products (without stock) — fast
 * GET  /api/products?withStock=1 → list products with current stock
 * GET  /api/products?q=<query>    → search by name OR SKU (with stock)
 * POST /api/products             → create a product
 */

import { NextRequest } from "next/server";
import {
  listProducts,
  listProductsWithStock,
  createProduct,
  searchProducts,
} from "@/lib/services/products";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const url = new URL(req.url);
    const queryParam = getQueryParam(req, "q");
    const withStock = url.searchParams.get("withStock") === "1";

    // Search takes precedence (and always returns stock).
    if (queryParam !== undefined && queryParam !== null) {
      const data = await searchProducts(queryParam, userId);
      return ok(data);
    }

    const data = withStock
      ? await listProductsWithStock(userId)
      : await listProducts(userId);

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const product = await createProduct(data, userId);
    return ok(product, 201);
  } catch (error) {
    return fail(error);
  }
}
