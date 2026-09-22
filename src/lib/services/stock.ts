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
import { invalidateCache } from "@/lib/utils/cache";
import type { Prisma } from "@prisma/client";

export type StockMoveView = {
  id: string;
  productId: string;
  type: string;
  quantity: string;
  reason: string | null;
  unitCost: string | null;
  remainingQuantity: string;  // how much of this batch is still in stock
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
    remainingQuantity: m.remainingQuantity.toString(),
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

    // For purchases and returns (batch-like moves), initialize remainingQuantity = quantity.
    // For adjustments, remainingQuantity stays at 0 (adjustments are not batch-trackable).
    const isBatchLike = data.type === "purchase" || data.type === "return";
    const initialRemaining = isBatchLike ? data.quantity : new Decimal(0);

    const created = await tx.stockMove.create({
      data: {
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        reason: data.reason ?? null,
        unitCost: data.unitCost ?? null,
        // Initialize remainingQuantity. For purchases/returns: starts at full quantity,
        // decreases as SaleItems link to this batch. For adjustments: 0 (not tracked).
        remainingQuantity: initialRemaining,
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

  // Invalidate caches (stock changes affect products, dashboard, P&L)
  invalidateCache("products");
  invalidateCache("dashboard");
  invalidateCache("profit-loss");

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

// ────────────────────────────────────────────────────────────────────────────
// Batch tracking — list product's available batches (FIFO friendly)
// ────────────────────────────────────────────────────────────────────────────

export type ProductBatch = {
  id: string;            // StockMove.id
  date: Date;            // when this batch was purchased/added
  quantity: string;      // original batch size
  remainingQuantity: string; // how much is still in stock from this batch
  unitCost: string | null;    // purchase cost per unit (may be null for adjustments/returns)
  type: string;          // "purchase" | "adjustment" | "return"
  reason: string | null;
};

/**
 * List all ACTIVE (non-voided) batches for a product, sorted OLDEST first
 * (FIFO-friendly). Includes batches with remaining = 0 (the UI can choose
 * to filter them out or display them as "sold out" for context).
 *
 * Used by the New Sale form to let the shopkeeper pick which batch to sell from.
 *
 * NOTE: We include type="purchase" and type="return" (both increase stock),
 * but EXCLUDE type="adjustment" (which is for stock corrections, not batches).
 *
 * Returns 1 query, no N+1.
 */
export async function listProductBatches(productId: string): Promise<ProductBatch[]> {
  // Verify product exists (throws 404 if not)
  const product = await prisma.product.findUnique({
    where: { id: productId, isDeleted: false },
    select: { id: true },
  });
  if (!product) {
    throw new NotFoundError("Product", productId);
  }

  const moves = await prisma.stockMove.findMany({
    where: {
      productId,
      voidedAt: null,
      // Only include batch-like moves (purchases and returns — both represent
      // discrete units entering stock that we can later sell from).
      type: { in: ["purchase", "return"] },
    },
    orderBy: { date: "asc" }, // OLDEST first — FIFO-friendly default
    select: {
      id: true,
      date: true,
      quantity: true,
      remainingQuantity: true,
      unitCost: true,
      type: true,
      reason: true,
    },
  });

  return moves.map((m) => ({
    id: m.id,
    date: m.date,
    quantity: m.quantity.toString(),
    remainingQuantity: m.remainingQuantity.toString(),
    unitCost: m.unitCost ? m.unitCost.toString() : null,
    type: m.type,
    reason: m.reason,
  }));
}
