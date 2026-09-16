/**
 * /api/customers/[id]/history
 *
 * GET → fetch one customer with their complete transaction history.
 *
 * Returns:
 *   - customer info (name, phone, address, notes)
 *   - balance summary (opening, totalPurchases, totalPayments, totalAdjustments, current balance)
 *   - transactions[] — chronologically sorted with runningBalance after each
 *
 * This is the canonical "khata view" — what the owner sees when they tap
 * a customer in the list.
 */

import { NextRequest } from "next/server";
import { getCustomerHistory } from "@/lib/services/customers";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const history = await getCustomerHistory(params.id);
    return ok(history);
  } catch (error) {
    return fail(error);
  }
}
