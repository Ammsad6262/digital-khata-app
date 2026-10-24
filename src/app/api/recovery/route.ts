/**
 * /api/recovery
 *
 * GET ?filter=all|overdue|due_soon|no_due_date
 *
 * Returns real customers with an open balance, the amount, the actual due
 * dates, the last payment and the last contact. Nothing here sends a message
 * or changes a balance.
 */

import { NextRequest } from "next/server";
import {
  getRecoveryData,
  type RecoveryFilter,
} from "@/lib/services/recovery";
import { ok, fail, getQueryParam } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

const FILTERS: RecoveryFilter[] = ["all", "overdue", "due_soon", "no_due_date"];

function parseFilter(value: string | null | undefined): RecoveryFilter {
  return FILTERS.includes((value ?? "") as RecoveryFilter)
    ? ((value ?? "all") as RecoveryFilter)
    : "all";
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const filter = parseFilter(getQueryParam(req, "filter"));
    const data = await getRecoveryData(userId, filter);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
