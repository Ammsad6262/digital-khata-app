/**
 * Sale service layer.
 *
 * Recording a sale touches up to 4 tables:
 *   1. Sale        (the invoice header)
 *   2. SaleItem    (one row per product — implicit stock decrement)
 *   3. Payment     (only if paidAmount > 0)
 *   4. Transaction (denormalized ledger mirror — 1 or 2 rows)
 *
 * All wrapped in prisma.$transaction — if any step fails, everything rolls back.
 * Stock reduction is implicit: SaleItem rows ARE the stock decrement, so
 * voiding a sale (sets voidedAt) automatically restores stock.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { createSaleSchema } from "@/lib/schemas/sale";
import { cached, invalidateCache } from "@/lib/utils/cache";
import {
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
} from "@/lib/utils/date";
import type { Prisma } from "@prisma/client";

export type SaleView = {
  id: string;
  customerId: string;
  totalAmount: string;
  paidAmount: string;
  outstanding: string;
  notes: string | null;
  date: Date;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SaleWithItems = SaleView & {
  customerName: string;
  customerPhone: string | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    productUnit: string;
    quantity: string;
    unitPrice: string;
    total: string;
  }>;
};

function toView(s: Prisma.SaleGetPayload<{}>): SaleView {
  return {
    id: s.id,
    customerId: s.customerId,
    totalAmount: s.totalAmount.toString(),
    paidAmount: s.paidAmount.toString(),
    outstanding: s.outstanding.toString(),
    notes: s.notes,
    date: s.date,
    voidedAt: s.voidedAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** List recent sales (default: last 50, active only) — WITH items + customer info. */
export async function listSales(limit = 50, userId?: string | null): Promise<SaleWithItems[]> {
  const sales = await prisma.sale.findMany({
    where: { voidedAt: null, ...(userId && { userId }) },
    include: {
      items: { include: { product: true } },
      customer: true,
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  return sales.map((s) => ({
    ...toView(s),
    customerName: s.customer.name,
    customerPhone: s.customer.phone ?? null,
    items: s.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      productUnit: i.product.unit,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      total: i.total.toString(),
    })),
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Lightweight list view (no items) — used by the Sales list page.
// ────────────────────────────────────────────────────────────────────────────

export type SaleListItem = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  totalAmount: string;
  paidAmount: string;
  outstanding: string;
  notes: string | null;
  date: Date;
  voidedAt: Date | null;
};

export type SaleFilter = "today" | "week" | "month" | "all";

/**
 * List sales (without items — fast for the list view) with date filtering.
 * Includes customer name + phone for context.
 *
 * Filter:
 *   today → sales where date >= start of today (in business TZ)
 *   week  → sales where date >= start of week (Monday, business TZ)
 *   month → sales where date >= start of month
 *   all   → no date filter (still excludes voided)
 *
 * Default limit 100 — the UI paginates / infinite-scrolls if needed.
 */
export async function listSalesFiltered(
  filter: SaleFilter = "all",
  options: {
    customerId?: string;
    limit?: number;
    timezone?: string;
  } = {},
  userId?: string | null,
): Promise<SaleListItem[]> {
  const { customerId, limit = 100, timezone = "Asia/Karachi" } = options;
  const cacheKey = `sales:list:${filter}:${customerId ?? "all"}:${limit}:${userId ?? "all"}`;

  return cached(cacheKey, async () => {
    let startDate: Date | undefined;

    switch (filter) {
      case "today": startDate = startOfTodayInTz(timezone); break;
      case "week":  startDate = startOfWeekInTz(timezone); break;
      case "month": startDate = startOfMonthInTz(timezone); break;
      case "all":   startDate = undefined; break;
    }

    const sales = await prisma.sale.findMany({
      where: {
        voidedAt: null,
        ...(userId && { userId }),
        ...(startDate && { date: { gte: startDate } }),
        ...(customerId && { customerId }),
      },
      include: { customer: true },
      orderBy: { date: "desc" },
      take: limit,
    });

    return sales.map((s) => ({
      id: s.id,
      customerId: s.customerId,
      customerName: s.customer.name,
      customerPhone: s.customer.phone ?? null,
      totalAmount: s.totalAmount.toString(),
      paidAmount: s.paidAmount.toString(),
      outstanding: s.outstanding.toString(),
      notes: s.notes,
      date: s.date,
      voidedAt: s.voidedAt,
    }));
  });
}

/** Fetch one sale with items + customer info. */
export async function getSale(id: string, userId?: string | null): Promise<SaleWithItems> {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: { include: { product: true } },
      customer: true,
    },
  });
  if (!sale || sale.voidedAt) {
    throw new NotFoundError("Sale", id);
  }
  // Tenant isolation: if a userId is provided and the sale belongs to a different
  // user, treat it as not found (avoids leaking record existence across tenants).
  if (userId && sale.userId && sale.userId !== userId) {
    throw new NotFoundError("Sale", id);
  }
  return {
    ...toView(sale),
    customerName: sale.customer.name,
    customerPhone: sale.customer.phone ?? null,
    items: sale.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      productUnit: i.product.unit,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      total: i.total.toString(),
    })),
  };
}

/**
 * Create a sale — the critical multi-table atomic operation.
 *
 * Steps:
 *  1. Validate customer exists
 *  2. Validate all products exist
 *  3. Compute totals (per-item total, totalAmount, outstanding)
 *  4. Verify paidAmount <= totalAmount
 *  5. BATCH VALIDATION: for each item with a batchId, verify the batch exists,
 *     belongs to the right product, is active (not voided), has enough
 *     remaining quantity. (Items without batchId = "from opening stock" —
 *     allowed but not tracked per-batch.)
 *  6. Create Sale + nested SaleItems (atomic in prisma.$transaction)
 *     - SaleItem.stockMoveId is set when batchId is provided
 *  7. Decrement StockMove.remainingQuantity for each linked batch
 *  8. If paidAmount > 0, create a Payment row linked to the sale
 *  9. Write 1-2 Transaction ledger rows (sale + optional payment)
 *
 * Stock is automatically reduced because SaleItem rows exist.
 * Batch-level stock (StockMove.remainingQuantity) is also decremented so the
 * "which batch am I selling from?" view stays accurate across sales.
 */
export async function createSale(input: unknown, userId?: string | null): Promise<SaleWithItems> {
  const data = createSaleSchema.parse(input);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Validate customer exists AND belongs to the authenticated user
    //    (legacy null-userId customers are visible to everyone for backward compat).
    const customer = await tx.customer.findFirst({
      where: {
        id: data.customerId,
        isDeleted: false,
        ...(userId && {
          OR: [{ userId }, { userId: null }],
        }),
      },
    });
    if (!customer) {
      throw new NotFoundError("Customer", data.customerId);
    }

    // 2. Validate all products exist AND belong to the authenticated user.
    // Dedupe productIds first — if the same product appears twice in items,
    // the findMany would return 1 row but productIds would have 2 entries,
    // causing a misleading "Product not found" error on a duplicate.
    const uniqueProductIds = Array.from(new Set(data.items.map((i) => i.productId)));
    const products = await tx.product.findMany({
      where: {
        id: { in: uniqueProductIds },
        isDeleted: false,
        ...(userId && {
          OR: [{ userId }, { userId: null }],
        }),
      },
    });
    if (products.length !== uniqueProductIds.length) {
      const foundIds = new Set(products.map((p) => p.id));
      const missing = uniqueProductIds.filter((id) => !foundIds.has(id));
      throw new NotFoundError("Product", missing[0]);
    }

    // 3. Compute totals using Decimal (no float math for money)
    const items = data.items.map((i) => ({
      productId: i.productId,
      quantity: new Decimal(i.quantity),
      unitPrice: new Decimal(i.unitPrice),
      total: new Decimal(i.quantity).times(new Decimal(i.unitPrice)),
      batchId: i.batchId ?? null,
    }));
    const totalAmount = items.reduce(
      (sum, i) => sum.plus(i.total),
      new Decimal(0),
    );
    const paidAmount = new Decimal(data.paidAmount);

    // 4. Verify paidAmount <= totalAmount
    if (paidAmount.gt(totalAmount)) {
      throw new BadRequestError(
        `Paid amount (${paidAmount}) cannot exceed sale total (${totalAmount}).`,
      );
    }

    const outstanding = totalAmount.minus(paidAmount);
    const saleDate = data.date ? new Date(data.date) : new Date();

    // 5. Batch validation — for each item with a batchId, verify the batch is
    //    valid AND has enough remaining quantity.
    //
    // We do this BEFORE creating the Sale so we can fail fast with a clear
    // error before any writes happen.
    //
    // IMPORTANT: a single batch can be referenced by multiple items in this
    // same sale (e.g. selling 5 kg from batch A in line 1, then another 3 kg
    // from batch A in line 2 — though the UI typically wouldn't allow this).
    // We need to check the CUMULATIVE demand against remaining.
    const batchDemand = new Map<string, Decimal>(); // batchId → cumulative qty demanded
    for (const item of items) {
      if (!item.batchId) continue;
      const prev = batchDemand.get(item.batchId) ?? new Decimal(0);
      batchDemand.set(item.batchId, prev.plus(item.quantity));
    }

    if (batchDemand.size > 0) {
      const batchIds = Array.from(batchDemand.keys());
      const batches = await tx.stockMove.findMany({
        where: {
          id: { in: batchIds },
          voidedAt: null,
          // Only purchase/return batches can be sold from
          type: { in: ["purchase", "return"] },
          // Tenant isolation: a user can only sell from batches belonging to them
          // (or legacy batches with null userId).
          ...(userId && {
            OR: [{ userId }, { userId: null }],
          }),
        },
        select: { id: true, productId: true, remainingQuantity: true },
      });

      // Validate each requested batch:
      // (a) exists + is active (not voided) + is a batch-type move
      // (b) belongs to the product the sale line is for
      // (c) has enough remaining (considering cumulative demand in this sale)
      const batchMap = new Map(batches.map((b) => [b.id, b]));
      for (const [batchId, demanded] of batchDemand.entries()) {
        const batch = batchMap.get(batchId);
        if (!batch) {
          throw new BadRequestError(
            `Batch ${batchId} not found, voided, or not a purchase/return batch.`,
          );
        }
        // Check the batch belongs to the product on whose line it was used.
        // (If multiple lines use the same batch, they must all be for the same product.)
        const itemsUsingBatch = items.filter((i) => i.batchId === batchId);
        const productMismatch = itemsUsingBatch.find((i) => i.productId !== batch.productId);
        if (productMismatch) {
          throw new BadRequestError(
            `Batch ${batchId} belongs to a different product than the sale line.`,
          );
        }
        const remaining = toDecimalOrZero(batch.remainingQuantity);
        if (demanded.gt(remaining)) {
          throw new BadRequestError(
            `Batch has only ${remaining} units remaining, but sale demands ${demanded}.`,
          );
        }
      }
    }

    // 6. Create Sale + nested SaleItems in one call
    //    SaleItem.stockMoveId is set per item (null if no batchId)
    //    userId is set from the authenticated user (NEVER from the client body).
    const sale = await tx.sale.create({
      data: {
        ...(userId && { userId }),
        customerId: data.customerId,
        totalAmount,
        paidAmount,
        outstanding,
        notes: data.notes ?? null,
        date: saleDate,
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
            stockMoveId: i.batchId, // null if not provided → untracked
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    // 7. Decrement remainingQuantity on each linked batch.
    //    We use updateMany to handle the case where the same batch is linked
    //    by multiple items in this sale — they all decrement together.
    //
    //    We batch the updates via Promise.all (they're independent operations
    //    on different batch rows — no DB-level contention because each batch
    //    is its own row).
    if (batchDemand.size > 0) {
      await Promise.all(
        Array.from(batchDemand.entries()).map(([batchId, demanded]) =>
          tx.stockMove.update({
            where: { id: batchId },
            data: {
              remainingQuantity: {
                decrement: demanded,
              },
            },
          }),
        ),
      );
    }

    // 8. If money was paid at sale time, create a linked Payment
    let paymentId: string | null = null;
    if (paidAmount.gt(0)) {
      const payment = await tx.payment.create({
        data: {
          ...(userId && { userId }),
          customerId: data.customerId,
          saleId: sale.id,
          amount: paidAmount,
          method: data.paymentMethod ?? "cash",
          date: saleDate,
        },
      });
      paymentId = payment.id;
    }

    // 9. Write Transaction ledger rows (batched — 1 createMany instead of 2 creates)
    const txRows: Array<{
      type: string;
      refType: string;
      refId: string;
      customerId: string;
      amount: typeof totalAmount;
      direction: string;
      date: Date;
      notes: string | null;
      userId?: string;
    }> = [{
      type: "sale",
      refType: "Sale",
      refId: sale.id,
      customerId: data.customerId,
      amount: totalAmount,
      direction: "debit",
      date: saleDate,
      notes: `Sale ${sale.id}`,
      ...(userId && { userId }),
    }];

    if (paymentId) {
      txRows.push({
        type: "payment",
        refType: "Payment",
        refId: paymentId,
        customerId: data.customerId,
        amount: paidAmount,
        direction: "credit",
        date: saleDate,
        notes: null,
        ...(userId && { userId }),
      });
    }

    await tx.transaction.createMany({ data: txRows });

    return sale;
  });

  // Invalidate caches (sale affects customers, products, dashboard, P&L)
  invalidateCache("customers");
  invalidateCache("products");
  invalidateCache("dashboard");
  invalidateCache("sales");
  invalidateCache("profit-loss");

  // Re-fetch with customer relation for the response.
  const withCustomer = await prisma.sale.findUniqueOrThrow({
    where: { id: result.id },
    include: { customer: true },
  });

  return {
    ...toView(result),
    customerName: withCustomer.customer.name,
    customerPhone: withCustomer.customer.phone ?? null,
    items: result.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      productUnit: i.product.unit,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      total: i.total.toString(),
    })),
  };
}

/**
 * Void a sale (preferred over deleting). Sets voidedAt on:
 *   - the Sale
 *   - any Payments explicitly linked to that sale
 *
 * After voiding:
 *   - sale.totalAmount excluded from customer balance → balance drops by totalAmount
 *   - linked payments excluded from customer balance → balance rises by paidAmount
 *   - SaleItem rows excluded from stock calc → stock restored
 *   - StockMove.remainingQuantity INCREMENTED for each linked batch → batch stock restored
 *
 * Net effect on customer balance: (paidAmount - totalAmount).
 */
export async function voidSale(id: string, userId?: string | null): Promise<{ id: string; voidedAt: Date }> {
  const result = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id },
      include: {
        payments: { where: { voidedAt: null } },
        items: {
          select: {
            id: true,
            quantity: true,
            stockMoveId: true,
          },
        },
      },
    });
    if (!sale) throw new NotFoundError("Sale", id);
    // Tenant isolation: a user can only void their own sales.
    // Legacy sales with null userId can be voided by anyone (until claimed).
    if (userId && sale.userId && sale.userId !== userId) {
      throw new NotFoundError("Sale", id);
    }
    if (sale.voidedAt) {
      throw new BadRequestError("Sale is already voided.");
    }

    const now = new Date();

    await tx.sale.update({
      where: { id },
      data: { voidedAt: now },
    });

    // Collect the IDs of all payments linked to this sale (including already-voided ones
    // — we want to clean up their Transaction rows too).
    const allPaymentsForSale = await tx.payment.findMany({
      where: { saleId: id },
      select: { id: true },
    });
    const paymentIds = allPaymentsForSale.map((p) => p.id);

    if (sale.payments.length > 0) {
      await tx.payment.updateMany({
        where: { saleId: id, voidedAt: null },
        data: { voidedAt: now },
      });
    }

    // ── Batch restoration ──────────────────────────────────────────────────
    // Each SaleItem linked to a batch must restore that batch's remainingQuantity.
    // Aggregate demand per batch first (in case multiple items used the same batch).
    const batchRestore = new Map<string, Decimal>();
    for (const item of sale.items) {
      if (!item.stockMoveId) continue;
      const prev = batchRestore.get(item.stockMoveId) ?? new Decimal(0);
      batchRestore.set(item.stockMoveId, prev.plus(toDecimalOrZero(item.quantity)));
    }
    if (batchRestore.size > 0) {
      await Promise.all(
        Array.from(batchRestore.entries()).map(([batchId, restoreQty]) =>
          tx.stockMove.update({
            where: { id: batchId },
            data: {
              remainingQuantity: {
                increment: restoreQty,
              },
            },
          }),
        ),
      );
    }

    // Delete the Transaction ledger rows for the voided sale + its linked payments.
    // The Transaction table is a denormalized mirror — voiding the source must
    // remove its mirror rows, otherwise the dashboard + transaction history
    // would still show the voided sale as an active money movement.
    await tx.transaction.deleteMany({
      where: {
        OR: [
          { refType: "Sale", refId: id },
          ...(paymentIds.length > 0
            ? [{ refType: "Payment", refId: { in: paymentIds } }]
            : []),
        ],
      },
    });

    return { id, voidedAt: now };
  });

  // Invalidate caches (voiding affects customers, products, dashboard, P&L)
  invalidateCache("customers");
  invalidateCache("products");
  invalidateCache("dashboard");
  invalidateCache("sales");
  invalidateCache("profit-loss");

  return result;
}
