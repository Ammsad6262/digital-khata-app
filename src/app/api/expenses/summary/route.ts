/**
 * GET /api/expenses/summary?filter=today|week|month|all
 *
 * Returns an aggregated summary of the authenticated user's expenses:
 *   - total + count for the selected filter
 *   - today's total + count (always — independent of filter)
 *   - this month's total + count (always — independent of filter)
 *   - per-category breakdown (for the selected filter, with percentages)
 *
 * All amounts are decimal-safe strings (no float math). The summary is NOT
 * cached — the UI is expected to use React Query with a reasonable staleTime.
 *
 * Security: userId derived from JWT cookie via requireActiveAccess. All
 * queries are scoped to that user (tenant isolation).
 */

import { NextRequest } from "next/server";
import { getExpensesSummary, type ExpenseFilter } from "@/lib/services/expenses";
import { ok, fail, getQueryParam } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

const VALID_FILTERS: ExpenseFilter[] = ["today", "week", "month", "all"];

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const filterRaw = getQueryParam(req, "filter");
    const filter = filterRaw && VALID_FILTERS.includes(filterRaw as ExpenseFilter)
      ? (filterRaw as ExpenseFilter)
      : "all";

    const summary = await getExpensesSummary(filter, {}, userId);
    return ok(summary);
  } catch (error) {
    return fail(error);
  }
}
