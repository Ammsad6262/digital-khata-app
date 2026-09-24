/**
 * /api/customers/[id]
 *
 * GET    → fetch one customer with their balance (404 if not found)
 * PATCH  → update a customer (openingBalance NOT updatable)
 * DELETE → soft-delete a customer (blocked if transactions exist)
 *
 * SECURITY: All operations verify ownership — the customer must belong
 * to the authenticated user. If userId doesn't match, returns 404.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest } from "next/server";
import {
  getCustomerWithBalance,
  updateCustomer,
  deleteCustomer,
} from "@/lib/services/customers";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId(req);
    const { id } = await params;
    const customer = await getCustomerWithBalance(id, userId);
    return ok(customer);
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

    const customer = await updateCustomer(id, data, userId);
    return ok(customer);
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
    const result = await deleteCustomer(id, userId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
