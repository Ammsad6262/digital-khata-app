/**
 * /api/payments
 *
 * GET  → list recent payments
 * POST → record a payment (atomic: Payment + Transaction ledger)
 */

import { NextRequest } from "next/server";
import { listPayments, recordPayment } from "@/lib/services/payments";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET() {
  try {
    const data = await listPayments(50);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const payment = await recordPayment(data);
    return ok(payment, 201);
  } catch (error) {
    return fail(error);
  }
}
