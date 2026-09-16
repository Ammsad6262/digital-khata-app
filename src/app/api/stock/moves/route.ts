/**
 * /api/stock/moves
 *
 * GET  → list recent stock moves
 * POST → record a stock move (purchase / adjustment / return)
 *        Atomic: StockMove + Transaction ledger
 */

import { NextRequest } from "next/server";
import { listStockMoves, addStockMove } from "@/lib/services/stock";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export async function GET() {
  try {
    const data = await listStockMoves(50);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const move = await addStockMove(data);
    return ok(move, 201);
  } catch (error) {
    return fail(error);
  }
}
