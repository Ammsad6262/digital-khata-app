/**
 * /api/payments
 *
 * GET  /api/payments                      → recent payments (with customer info)
 * GET  /api/payments?filter=today|week|month|all → filtered list
 * GET  /api/payments?filter=...&customerId=X → also filter by customer
 * POST /api/payments                      → record a payment (atomic)
 */

import { NextRequest } from "next/server";
import {
  listPayments,
  listPaymentsFiltered,
  recordPayment,
  type PaymentFilter,
} from "@/lib/services/payments";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

const VALID_FILTERS: PaymentFilter[] = ["today", "week", "month", "all"];

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const filterRaw = getQueryParam(req, "filter");

    // No filter → return recent 50 with customer info.
    if (!filterRaw) {
      const data = await listPayments(50, userId);
      return ok(data);
    }

    const filter = VALID_FILTERS.includes(filterRaw as PaymentFilter)
      ? (filterRaw as PaymentFilter)
      : "all";

    const customerId = getQueryParam(req, "customerId");

    const data = await listPaymentsFiltered(
      filter,
      {
        customerId,
        limit: 200,
      },
      userId,
    );

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

    const payment = await recordPayment(data, userId);
    return ok(payment, 201);
  } catch (error) {
    return fail(error);
  }
}
