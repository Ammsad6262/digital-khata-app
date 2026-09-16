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
import { NotFoundError } from "@/lib/errors";
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
    // For purchases with unit cost: amount = quantity * unitCost
    // For adjustments/returns: amount = abs(quantity) (used purely for display)
    const moveAmount =
      data.unitCost !== undefined && data.unitCost !== null
        ? new Decimal(data.quantity).times(new Decimal(data.unitCost))
        : new Decimal(data.quantity).abs();

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

/** Void a stock move (sets voidedAt, excludes it from stock calc). */
export async function voidStockMove(id: string): Promise<{ id: string; voidedAt: Date }> {
  const move = await prisma.stockMove.findUnique({ where: { id } });
  if (!move) throw new NotFoundError("StockMove", id);
  if (move.voidedAt) throw new Error("StockMove is already voided.");

  const now = new Date();
  await prisma.stockMove.update({
    where: { id },
    data: { voidedAt: now },
  });

  return { id, voidedAt: now };
}
