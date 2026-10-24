/**
 * /api/suppliers
 *
 * GET  → list suppliers (with balances by default — supplier lists are small)
 * GET  ?q=<query>          → search by name OR phone (with balances)
 * POST → create a supplier
 *
 * SECURITY: every operation is scoped to the authenticated user.
 */

import { NextRequest } from "next/server";
import {
  listSuppliersWithBalance,
  searchSuppliers,
  createSupplier,
} from "@/lib/services/suppliers";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const queryParam = getQueryParam(req, "q");

    if (queryParam !== undefined && queryParam !== null && queryParam.trim() !== "") {
      const data = await searchSuppliers(queryParam, userId);
      return ok(data);
    }

    const data = await listSuppliersWithBalance(userId);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const supplier = await createSupplier(data, userId);
    return ok(supplier, 201);
  } catch (error) {
    return fail(error);
  }
}
