/**
 * /api/customers
 *
 * GET    /api/customers           → list customers (active only)
 * GET    /api/customers?outstanding=1 → list customers who owe money, sorted by balance
 * POST   /api/customers           → create a customer
 */

import { NextRequest } from "next/server";
import {
  listCustomers,
  listOutstandingCustomers,
  createCustomer,
} from "@/lib/services/customers";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const outstandingOnly = url.searchParams.get("outstanding") === "1";

    if (outstandingOnly) {
      const data = await listOutstandingCustomers();
      return ok(data);
    }

    const data = await listCustomers();
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const customer = await createCustomer(data);
    return ok(customer, 201);
  } catch (error) {
    return fail(error);
  }
}
