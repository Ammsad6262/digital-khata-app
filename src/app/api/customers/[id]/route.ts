/**
 * /api/customers/[id]
 *
 * GET    → fetch one customer with their balance (404 if not found)
 * PATCH  → update a customer (openingBalance NOT updatable)
 * DELETE → soft-delete a customer (blocked if transactions exist)
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const customer = await getCustomerWithBalance(id);
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
    const { id } = await params;
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const customer = await updateCustomer(id, data);
    return ok(customer);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await deleteCustomer(id);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
