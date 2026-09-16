/**
 * Stock service layer.
 *
 * Records intentional stock changes (purchases, adjustments, returns).
 * Stock sold via a Sale is tracked in SaleItem — NOT here. See
 * lib/services/products.ts getProductStock() for the derived formula.
 *
 * Atomic: writes StockMove + Transaction row in the same prisma.$transaction.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal } from "@/lib/utils/decimal";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { createStockMoveSchema } from "@/lib/schemas/stock";
import type { Prisma } from "@prisma/client";

export type StockMoveView = {
  id: string;
  productId: string;
  type: string;
  quantity: string;
  reason: string | null;
  unitCost: string | null;
  date: Date;
  voidedAt: Date | null;
  createdAt: Date;
};

function toView(m: Prisma.StockMoveGetPayload<{}>): StockMoveView {
  return {
    id: m.id,
    productId: m.productId,
    type: m.type,
    quantity: m.quantity.toString(),
    reason: m.reason,
    unitCost: m.unitCost ? m.unitCost.toString() : null,
    date: m.date,
    voidedAt: m.voidedAt,
    createdAt: m.createdAt,
  };
}

/** List recent stock moves (default: last 50, active only). */
export async function listStockMoves(limit = 50): Promise<StockMoveView[]> {
  const moves = await prisma.stockMove.findMany({
    where: { voidedAt: null },
    orderBy: { date: "desc" },
    take: limit,
  });
  return moves.map(toView);
}

/** List stock moves for a specific product (its full history). */
export async function listStockMovesByProduct(productId: string): Promise<StockMoveView[]> {
  const moves = await prisma.stockMove.findMany({
    where: { productId },
    orderBy: { date: "desc" },
  });
  return moves.map(toView);
}

/** Add stock (purchase from supplier, return, or adjustment). Atomic. */
export async function addStockMove(input: unknown): Promise<StockMoveView> {
  const data = createStockMoveSchema.parse(input);

  const move = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: data.productId, isDeleted: false },
    });
    if (!product) {
      throw new NotFoundError("Product", data.productId);
    }

    const created = await tx.stockMove.create({
      data: {
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        reason: data.reason ?? null,
        unitCost: data.unitCost ?? null,
        date: data.date ? new Date(data.date) : new Date(),
      },
    });

    // Compute the "amount" for the transaction ledger.
    // Per schema contract: amount is ALWAYS non-negative; direction tells the sign.
    // For purchases with unit cost: amount = abs(quantity) * unitCost
    // For adjustments/returns: amount = abs(quantity)
    const qty = new Decimal(data.quantity);
    const moveAmount =
      data.unitCost !== undefined && data.unitCost !== null
        ? qty.abs().times(new Decimal(data.unitCost))
        : qty.abs();

    await tx.transaction.create({
      data: {
        type: "stock_move",
        refType: "StockMove",
        refId: created.id,
        productId: data.productId,
        amount: moveAmount,
        // direction: "debit" = stock increases (purchase/return/positive adjustment)
        //            "credit" = stock decreases (negative adjustment)
        direction: data.quantity > 0 ? "debit" : "credit",
        date: created.date,
      },
    });

    return created;
  });

  return toView(move);
}

/** Void a stock move — atomic + cleans up the Transaction mirror. */
export async function voidStockMove(id: string): Promise<{ id: string; voidedAt: Date }> {
  return await prisma.$transaction(async (tx) => {
    const move = await tx.stockMove.findUnique({ where: { id } });
    if (!move) throw new NotFoundError("StockMove", id);
    if (move.voidedAt) throw new BadRequestError("StockMove is already voided.");

    const now = new Date();
    await tx.stockMove.update({
      where: { id },
      data: { voidedAt: now },
    });

    // Delete the Transaction ledger row for this stock move.
    await tx.transaction.deleteMany({
      where: { refType: "StockMove", refId: id },
    });

    return { id, voidedAt: now };
  });
}
