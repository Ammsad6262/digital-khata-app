/**
 * /api/transactions
 *
 * GET → list transactions (enriched with customer/product names)
 *
 * Query params:
 *   filter=today|week|month|all|custom  (default: all)
 *   type=sale|payment|expense|stock_move|balance_adjustment
 *   customerId=<id>
 *   productId=<id>
 *   from=<ISO date>     (required when filter=custom; e.g. 2026-09-01)
 *   to=<ISO date>       (optional when filter=custom; defaults to now)
 *   limit=<n>           (default: 100)
 *   summary=1            (if set, also returns summary stats for the same filter)
 *
 * The custom date range is INCLUSIVE on both ends:
 *   from=2026-09-01 + to=2026-09-15 → returns transactions from
 *   2026-09-01 00:00:00 UTC through 2026-09-15 23:59:59 UTC
 */

import { NextRequest } from "next/server";
import {
  listTransactionsEnriched,
  getTransactionSummary,
  type TransactionFilter,
  type TransactionType,
} from "@/lib/services/transactions";
import { ok, fail, getQueryParam, getIntQueryParam } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

const VALID_FILTERS: TransactionFilter[] = ["today", "week", "month", "all", "custom"];
const VALID_TYPES: TransactionType[] = [
  "sale",
  "payment",
  "expense",
  "stock_move",
  "balance_adjustment",
];

/** Convert a YYYY-MM-DD string to a UTC Date at the START of that day. */
function parseDateStart(input: string): Date | undefined {
  if (!input) return undefined;
  // Treat as UTC midnight to be timezone-predictable.
  const d = new Date(`${input}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Convert a YYYY-MM-DD string to a UTC Date at the END of that day. */
function parseDateEnd(input: string): Date | undefined {
  if (!input) return undefined;
  const d = new Date(`${input}T23:59:59.999Z`);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const filterRaw = getQueryParam(req, "filter", "all");
    const filter = VALID_FILTERS.includes(filterRaw as TransactionFilter)
      ? (filterRaw as TransactionFilter)
      : "all";

    const typeRaw = getQueryParam(req, "type");
    const type = typeRaw && VALID_TYPES.includes(typeRaw as TransactionType)
      ? (typeRaw as TransactionType)
      : undefined;

    const customerId = getQueryParam(req, "customerId");
    const productId = getQueryParam(req, "productId");
    const limit = getIntQueryParam(req, "limit", 100);
    const includeSummary = getQueryParam(req, "summary") === "1";

    // Parse custom date range if applicable
    let from: Date | undefined;
    let to: Date | undefined;
    if (filter === "custom") {
      const fromRaw = getQueryParam(req, "from");
      const toRaw = getQueryParam(req, "to");
      if (!fromRaw) {
        return fail(new Error("Custom date range requires 'from' parameter."));
      }
      from = parseDateStart(fromRaw);
      to = toRaw ? parseDateEnd(toRaw) : new Date();
      if (!from) {
        return fail(new Error("Invalid 'from' date. Use YYYY-MM-DD format."));
      }
    }

    const [transactions, summary] = await Promise.all([
      listTransactionsEnriched(
        {
          filter,
          type,
          customerId,
          productId,
          limit,
          from,
          to,
        },
        userId,
      ),
      includeSummary
        ? getTransactionSummary({ filter, type, customerId, from, to }, userId)
        : Promise.resolve(null),
    ]);

    return ok({
      transactions,
      summary,
    });
  } catch (error) {
    return fail(error);
  }
}
