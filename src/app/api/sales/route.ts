/**
 * /api/sales
 *
 * GET  → list recent sales (with items)
 * POST → create a sale (atomic: Sale + SaleItems + Payment + Transaction ledger)
 */

import { NextRequest } from "next/server";
import { listSales, createSale } from "@/lib/services/sales";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET() {
  try {
    const data = await listSales(50);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const sale = await createSale(data);
    return ok(sale, 201);
  } catch (error) {
    return fail(error);
  }
}
