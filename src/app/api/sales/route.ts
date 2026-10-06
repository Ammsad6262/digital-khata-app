/**
 * /api/sales
 *
 * GET  /api/sales                      → recent sales (with items + customer)
 * GET  /api/sales?filter=today|week|month|all → sales list (lightweight, no items) for the Sales page
 * GET  /api/sales?filter=...&customerId=X → also filter by customer
 * POST /api/sales                      → create a sale (atomic)
 *
 * The `?filter=` param switches to the lightweight list (no items, just customer
 * + totals) which is faster for the list view.
 */

import { NextRequest } from "next/server";
import {
  listSales,
  listSalesFiltered,
  createSale,
  type SaleFilter,
} from "@/lib/services/sales";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

const VALID_FILTERS: SaleFilter[] = ["today", "week", "month", "all"];

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const filterRaw = getQueryParam(req, "filter");

    // No filter → return the rich list (with items), recent 50.
    if (!filterRaw) {
      const data = await listSales(50, userId);
      return ok(data);
    }

    // With filter → use the lightweight listSalesFiltered (no items).
    const filter = VALID_FILTERS.includes(filterRaw as SaleFilter)
      ? (filterRaw as SaleFilter)
      : "all";

    const customerId = getQueryParam(req, "customerId");

    const data = await listSalesFiltered(
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
    const userId = await requireActiveAccess(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const sale = await createSale(data, userId);
    return ok(sale, 201);
  } catch (error) {
    return fail(error);
  }
}
