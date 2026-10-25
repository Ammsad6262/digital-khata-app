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
import { startOfDayInTz, startOfTodayInTz } from "@/lib/utils/date";
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
  /** Date the supplier agreed to be paid by, if one was recorded. */
  dueDate: Date | null;
  /** Remaining > 0 and dueDate is before today (business timezone). */
  isOverdue: boolean;
  voidedAt: Date | null;
  createdAt: Date;
  items: PurchaseItemView[];
};

/** Overdue means there is still money on this invoice and its due date passed. */
function computeIsOverdue(remaining: Decimal, dueDate: Date | null): boolean {
  if (!dueDate) return false;
  if (remaining.lte(0)) return false;
  return dueDate.getTime() < startOfTodayInTz().getTime();
}

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
    dueDate: p.dueDate,
    isOverdue: computeIsOverdue(remaining, p.dueDate),
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

/** Attach post-purchase payment totals in grouped queries (no N+1).
 *
 * Payments linked to an invoice are applied to that invoice. Payments made
 * against the supplier's overall balance are applied to open invoices
 * oldest-due-first (invoices without a due date last). This is a display
 * allocation only: it never rewrites `Purchase.outstanding` or the supplier
 * payable.
 */
async function decorate(
  rows: PurchaseRow[],
  userId: string,
): Promise<PurchaseView[]> {
  if (rows.length === 0) return [];

  const supplierIds = [...new Set(rows.map((r) => r.supplierId))];

  const [linkedGroups, unlinkedGroups, openRows] = await Promise.all([
    prisma.supplierPayment.groupBy({
      by: ["purchaseId"],
      _sum: { amount: true },
      where: {
        purchaseId: { in: rows.map((r) => r.id) },
        voidedAt: null,
        userId,
      },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId"],
      _sum: { amount: true },
      where: {
        supplierId: { in: supplierIds },
        purchaseId: null,
        voidedAt: null,
        userId,
      },
    }),
    // Allocation must consider every open invoice for the supplier, not only
    // the rows on this screen. Otherwise a single-invoice view would hand it
    // every unlinked payment and show the wrong remaining amount.
    prisma.purchase.findMany({
      where: { userId, voidedAt: null, supplierId: { in: supplierIds } },
      select: {
        id: true,
        supplierId: true,
        outstanding: true,
        date: true,
        dueDate: true,
      },
    }),
  ]);

  const linkedMap = new Map(
    linkedGroups.map((g) => [g.purchaseId, toDecimalOrZero(g._sum.amount)]),
  );
  const unlinkedMap = new Map(
    unlinkedGroups.map((g) => [g.supplierId, toDecimalOrZero(g._sum.amount)]),
  );

  const rowsBySupplier = new Map<string, (typeof openRows)[number][]>();
  for (const row of openRows) {
    const list = rowsBySupplier.get(row.supplierId) ?? [];
    list.push(row);
    rowsBySupplier.set(row.supplierId, list);
  }

  // Voided rows keep only their directly linked payments.
  const paidMap = new Map<string, Decimal>();
  for (const row of rows) {
    paidMap.set(row.id, linkedMap.get(row.id) ?? new Decimal(0));
  }

  for (const [supplierId, list] of rowsBySupplier) {
    let unallocated = unlinkedMap.get(supplierId) ?? new Decimal(0);
    const ordered = [...list].sort((a, b) => {
      const aDue = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.date.getTime() - b.date.getTime();
    });

    for (const row of ordered) {
      let paid = linkedMap.get(row.id) ?? new Decimal(0);
      const remaining = toDecimalOrZero(row.outstanding).minus(paid);
      if (remaining.gt(0) && unallocated.gt(0)) {
        const allocated = remaining.lt(unallocated) ? remaining : unallocated;
        paid = paid.plus(allocated);
        unallocated = unallocated.minus(allocated);
      }
      paidMap.set(row.id, paid);
    }
  }

  return rows.map((r) => toView(r, paidMap.get(r.id) ?? new Decimal(0)));
}

/** List purchases for one supplier (newest first). */
export async function listPurchasesBySupplier(
  supplierId: string,
  userId: string,
): Promise<PurchaseView[]> {
  await getSupplier(supplierId, userId); // 404s if not owned by this tenant
  const rows = await prisma.purchase.findMany({
    where: { supplierId, userId },
    include: purchaseInclude,
    orderBy: { date: "desc" },
    take: 200,
  });
  return decorate(rows, userId);
}

/** Fetch one purchase (404 if not found / not owned). */
export async function getPurchase(
  id: string,
  userId: string,
): Promise<PurchaseView> {
  const row = await prisma.purchase.findFirst({
    where: { id, userId },
    include: purchaseInclude,
  });
  if (!row) throw new NotFoundError("api.resource.purchase", id);
  const [view] = await decorate([row], userId);
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

    // Optional "pay by" date. A bare YYYY-MM-DD is treated as midnight in the
    // business timezone so "due today" means today, not 5 AM.
    let dueDate: Date | null = null;
    if (data.dueDate) {
      dueDate = /^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)
        ? startOfDayInTz(data.dueDate)
        : new Date(data.dueDate);
      if (!dueDate || Number.isNaN(dueDate.getTime())) {
        throw new BadRequestError("api.purchase.invalidDueDate");
      }
    }

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
        dueDate,
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
        dueDate: created.dueDate?.toISOString() ?? null,
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
