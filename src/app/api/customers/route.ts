/**
 * /api/customers
 *
 * GET    /api/customers              → list ALL customers (without balance) — fast
 * GET    /api/customers?withBalances=1 → list ALL customers WITH current balance
 * GET    /api/customers?q=<query>    → search by name OR phone (with balance)
 * GET    /api/customers?outstanding=1 → list customers who owe money, sorted by balance
 * POST   /api/customers              → create a customer
 *
 * Note on performance:
 *   - `?withBalances=1` computes balances for every customer (N+1-ish, runs 3
 *     aggregates per customer in parallel). For V1 with hundreds of customers
 *     this is fine. For V2 scale we'll denormalize into a CustomerBalance view.
 *   - Search uses Prisma's `contains` (LIKE %q%) on name + phone.
 */

import { NextRequest } from "next/server";
import {
  listCustomers,
  listOutstandingCustomers,
  createCustomer,
  searchCustomers,
  listAllCustomersWithBalance,
} from "@/lib/services/customers";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const url = new URL(req.url);
    const queryParam = getQueryParam(req, "q");
    const withBalances = url.searchParams.get("withBalances") === "1";
    const outstandingOnly = url.searchParams.get("outstanding") === "1";

    // Search takes precedence (and always returns balances).
    if (queryParam !== undefined && queryParam !== null) {
      const data = await searchCustomers(queryParam, userId);
      return ok(data);
    }

    if (outstandingOnly) {
      const data = await listOutstandingCustomers(userId);
      return ok(data);
    }

    if (withBalances) {
      const data = await listAllCustomersWithBalance(userId);
      return ok(data);
    }

    // Default: list customers without balance (fastest path).
    const data = await listCustomers(userId);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const customer = await createCustomer(data, userId);
    return ok(customer, 201);
  } catch (error) {
    return fail(error);
  }
}
