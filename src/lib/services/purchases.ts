/**
 * Purchase service layer.
 *
 * A purchase = stock bought from a supplier. It is the mirror of a Sale:
 *
 *   Purchase 1—* PurchaseItem 1—1 StockMove (the batch that increases stock)
 *
 * Creating a purchase is ATOMIC: purchase + items + stock moves + ledger
 * transactions are written in one prisma.$transaction. Stock is derived from
 * StockMove rows (see products.getProductStock), so adding the moves IS the
 * stock increase — there is no separate counter to keep in sync.
 *
 * Payable is derived (see services/suppliers.ts):
 *   openingBalance + SUM(purchase.outstanding) − SUM(supplierPayment.amount)
 * so an up-front part-payment is captured by `outstanding` and later payments
 * are captured by SupplierPayment rows. No double counting.
 *
 * Every query is scoped by `userId` for tenant isolation.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { invalidateCache } from "@/lib/utils/cache";
import { recordAudit } from "@/lib/services/audit";
import { createPurchaseSchema } from "@/lib/schemas/purchase";
import { getSupplier } from "@/lib/services/suppliers";
import type { Prisma } from "@prisma/client";

const purchaseInclude = {
  supplier: { select: { name: true } },
  items: {
    include: {
      product: { select: { name: true } },
      stockMove: { select: { batchName: true } },
    },
  },
} satisfies Prisma.PurchaseInclude;

type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

export type PurchaseItemView = {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  unitCost: string;
  total: string;
  batchName: string | null;
};

export type PurchaseView = {
  id: string;
  supplierId: string;
  supplierName: string | null;
  totalAmount: string;
  paidAmount: string;
  /** Unpaid at purchase time (total − paid at purchase). */
  outstanding: string;
  /** Money paid against this invoice AFTER it was created. */
  paidSince: string;
  /** What is still owed on this invoice = outstanding − paidSince. */
  remaining: string;
  notes: string | null;
  date: Date;
  voidedAt: Date | null;
  createdAt: Date;
  items: PurchaseItemView[];
};

function toView(p: PurchaseRow, paidSince: Decimal): PurchaseView {
  const remaining = toDecimalOrZero(p.outstanding).minus(paidSince);
  return {
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplier?.name ?? null,
    totalAmount: p.totalAmount.toString(),
    paidAmount: p.paidAmount.toString(),
    outstanding: p.outstanding.toString(),
    paidSince: paidSince.toString(),
    remaining: remaining.toString(),
    notes: p.notes,
    date: p.date,
    voidedAt: p.voidedAt,
    createdAt: p.createdAt,
    items: p.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product?.name ?? "",
      quantity: it.quantity.toString(),
      unitCost: it.unitCost.toString(),
      total: it.total.toString(),
      batchName: it.stockMove?.batchName ?? null,
    })),
  };
}

/** Attach post-purchase payment totals in a single grouped query (no N+1). */
async function decorate(rows: PurchaseRow[]): Promise<PurchaseView[]> {
  if (rows.length === 0) return [];
  const grouped = await prisma.supplierPayment.groupBy({
    by: ["purchaseId"],
    _sum: { amount: true },
    where: { purchaseId: { in: rows.map((r) => r.id) }, voidedAt: null },
  });
  const map = new Map(
    grouped.map((g) => [g.purchaseId, toDecimalOrZero(g._sum.amount)]),
  );
  return rows.map((r) => toView(r, map.get(r.id) ?? new Decimal(0)));
}

/** List purchases for one supplier (newest first). */
export async function listPurchasesBySupplier(
  supplierId: string,
  userId?: string | null,
): Promise<PurchaseView[]> {
  await getSupplier(supplierId, userId); // 404s if not owned by this tenant
  const rows = await prisma.purchase.findMany({
    where: { supplierId, ...(userId && { userId }) },
    include: purchaseInclude,
    orderBy: { date: "desc" },
    take: 200,
  });
  return decorate(rows);
}

/** Fetch one purchase (404 if not found / not owned). */
export async function getPurchase(
  id: string,
  userId?: string | null,
): Promise<PurchaseView> {
  const row = await prisma.purchase.findFirst({
    where: { id, ...(userId && { userId }) },
    include: purchaseInclude,
  });
  if (!row) throw new NotFoundError("api.resource.purchase", id);
  const [view] = await decorate([row]);
  return view!;
}

/**
 * Create a purchase (stock in). Atomic.
 *
 * Guards:
 *   - supplier must belong to this tenant
 *   - every product must belong to this tenant
 *   - paidAmount cannot exceed the total
 *   - identical purchase within the last 60s is rejected (double-submit guard)
 */
export async function createPurchase(
  input: unknown,
  userId?: string | null,
): Promise<PurchaseView> {
  const data = createPurchaseSchema.parse(input);

  const created = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: data.supplierId, isDeleted: false, ...(userId && { userId }) },
      select: { id: true, name: true },
    });
    if (!supplier) throw new NotFoundError("api.resource.supplier", data.supplierId);

    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        isDeleted: false,
        // Legacy products may have a null userId (pre-auth data) — same rule
        // the existing stock service uses.
        ...(userId && { OR: [{ userId }, { userId: null }] }),
      },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    for (const id of productIds) {
      if (!productMap.has(id)) throw new NotFoundError("api.resource.product", id);
    }

    let totalAmount = new Decimal(0);
    const lines = data.items.map((item) => {
      const qty = new Decimal(item.quantity);
      const cost = new Decimal(item.unitCost);
      const lineTotal = qty.times(cost);
      totalAmount = totalAmount.plus(lineTotal);
      return { ...item, qty, cost, lineTotal };
    });

    const paid = new Decimal(data.paidAmount);
    if (paid.greaterThan(totalAmount)) {
      throw new BadRequestError("api.purchase.paidExceedsTotal", undefined, {
        total: totalAmount.toString(),
        paid: paid.toString(),
      });
    }
    const outstanding = totalAmount.minus(paid);
    const purchaseDate = data.date ?? new Date();

    // Double-submit guard: an identical purchase seconds ago is a duplicate.
    const recent = await tx.purchase.findFirst({
      where: {
        supplierId: data.supplierId,
        totalAmount,
        paidAmount: paid,
        voidedAt: null,
        createdAt: { gte: new Date(Date.now() - 60_000) },
        ...(userId && { userId }),
      },
      select: { id: true },
    });
    if (recent) throw new BadRequestError("api.duplicateTransaction");

    const purchase = await tx.purchase.create({
      data: {
        ...(userId && { userId }),
        supplierId: data.supplierId,
        totalAmount,
        paidAmount: paid,
        outstanding,
        notes: data.notes ?? null,
        date: purchaseDate,
      },
    });

    for (const line of lines) {
      const move = await tx.stockMove.create({
        data: {
          ...(userId && { userId }),
          productId: line.productId,
          type: "purchase",
          quantity: line.qty,
          reason: `Purchase from ${supplier.name}`,
          unitCost: line.cost,
          batchName: line.batchName?.trim() ? line.batchName.trim() : null,
          remainingQuantity: line.qty,
          date: purchaseDate,
        },
      });

      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: line.productId,
          quantity: line.qty,
          unitCost: line.cost,
          total: line.lineTotal,
          stockMoveId: move.id,
        },
      });

      await tx.transaction.create({
        data: {
          ...(userId && { userId }),
          type: "stock_move",
          refType: "StockMove",
          refId: move.id,
          productId: line.productId,
          amount: line.qty.abs().times(line.cost),
          direction: "debit", // stock increases
          notes: `Purchase from ${supplier.name}`,
          date: purchaseDate,
        },
      });
    }

    return tx.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: purchaseInclude,
    });
  });

  invalidateCache("suppliers");
  invalidateCache("products");
  invalidateCache("dashboard");
  invalidateCache("profit-loss");

  if (userId) {
    await recordAudit(userId, {
      action: "purchase.create",
      entityType: "Purchase",
      entityId: created.id,
      summary: `Purchase from ${created.supplier.name}`,
      metadata: {
        total: created.totalAmount.toString(),
        paid: created.paidAmount.toString(),
        supplierId: created.supplierId,
      },
    });
  }

  return toView(created, new Decimal(0));
}

/**
 * Void a purchase. Atomic.
 *
 * Blocked if any of its batches has already been (partly) sold, because
 * removing the stock would push inventory negative.
 */
export async function voidPurchase(
  id: string,
  userId?: string | null,
): Promise<{ id: string; voidedAt: Date }> {
  const result = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id, ...(userId && { userId }) },
      include: { items: { include: { stockMove: true } } },
    });
    if (!purchase) throw new NotFoundError("api.resource.purchase", id);
    if (purchase.voidedAt) throw new BadRequestError("api.purchase.alreadyVoided");

    for (const item of purchase.items) {
      const move = item.stockMove;
      if (
        move &&
        toDecimalOrZero(move.remainingQuantity).lessThan(toDecimalOrZero(move.quantity))
      ) {
        throw new BadRequestError("api.purchase.cannotVoidConsumedStock");
      }
    }

    const now = new Date();
    await tx.purchase.update({ where: { id }, data: { voidedAt: now } });

    const moveIds = purchase.items
      .map((i) => i.stockMoveId)
      .filter((v): v is string => !!v);
    if (moveIds.length > 0) {
      await tx.stockMove.updateMany({
        where: { id: { in: moveIds }, voidedAt: null },
        data: { voidedAt: now },
      });
      await tx.transaction.deleteMany({
        where: { refType: "StockMove", refId: { in: moveIds } },
      });
    }

    return { id, voidedAt: now };
  });

  invalidateCache("suppliers");
  invalidateCache("products");
  invalidateCache("dashboard");
  invalidateCache("profit-loss");

  if (userId) {
    await recordAudit(userId, {
      action: "purchase.void",
      entityType: "Purchase",
      entityId: id,
      summary: "Voided a purchase",
      metadata: { voidedAt: result.voidedAt.toISOString() },
    });
  }

  return result;
}
