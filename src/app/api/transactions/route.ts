/**
 * /api/transactions
 *
 * GET → list transactions (filtered by date range and/or type)
 *
 * Query params:
 *   filter=today|week|month|all  (default: all)
 *   type=sale|payment|expense|stock_move|balance_adjustment
 *   customerId=<id>
 *   limit=<n>  (default: 100)
 */

import { NextRequest } from "next/server";
import { listTransactions, type TransactionFilter } from "@/lib/services/transactions";
import { ok, fail, getQueryParam, getIntQueryParam } from "@/lib/utils/api";

const VALID_FILTERS: TransactionFilter[] = ["today", "week", "month", "all"];
const VALID_TYPES = ["sale", "payment", "expense", "stock_move", "balance_adjustment"];

export async function GET(req: NextRequest) {
  try {
    const filterRaw = getQueryParam(req, "filter", "all");
    const filter = VALID_FILTERS.includes(filterRaw as TransactionFilter)
      ? (filterRaw as TransactionFilter)
      : "all";

    const typeRaw = getQueryParam(req, "type");
    const type = typeRaw && VALID_TYPES.includes(typeRaw) ? typeRaw : undefined;

    const customerId = getQueryParam(req, "customerId");
    const limit = getIntQueryParam(req, "limit", 100);

    const data = await listTransactions({
      filter,
      type,
      customerId,
      limit,
    });

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
