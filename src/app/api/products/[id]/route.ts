/**
 * /api/products/[id]
 *
 * GET    → fetch one product with current stock
 * PATCH  → update a product
 * DELETE → soft-delete a product (blocks if it has active sales/stock)
 *
 * SECURITY: Verifies ownership — product must belong to the authenticated user.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest } from "next/server";
import { getProductWithStock, updateProduct, deleteProduct } from "@/lib/services/products";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId(req);
    const { id } = await params;
    const product = await getProductWithStock(id, userId);
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
    const userId = await getCurrentUserId(req);
    const { id } = await params;
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const product = await updateProduct(id, data, userId);
    return ok(product);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId(req);
    const { id } = await params;
    const result = await deleteProduct(id, userId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
