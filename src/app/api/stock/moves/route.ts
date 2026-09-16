/**
 * /api/stock/moves
 *
 * GET  /api/stock/moves                       → recent stock moves (last 50)
 * GET  /api/stock/moves?productId=X            → all stock moves for one product
 * POST /api/stock/moves                       → record a stock move
 *        (purchase / adjustment / return — atomic with the Transaction ledger)
 */

import { NextRequest } from "next/server";
import {
  listStockMoves,
  listStockMovesByProduct,
  addStockMove,
} from "@/lib/services/stock";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const productId = getQueryParam(req, "productId");

    if (productId) {
      const data = await listStockMovesByProduct(productId);
      return ok(data);
    }

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
