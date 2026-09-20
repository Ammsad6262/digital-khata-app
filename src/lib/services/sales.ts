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
import { Decimal } from "@/lib/utils/decimal";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { createSaleSchema } from "@/lib/schemas/sale";
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
  customerPhone: string;
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
export async function listSales(limit = 50): Promise<SaleWithItems[]> {
  const sales = await prisma.sale.findMany({
    where: { voidedAt: null },
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
    customerPhone: s.customer.phone,
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
  customerPhone: string;
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
): Promise<SaleListItem[]> {
  const { customerId, limit = 100, timezone = "Asia/Karachi" } = options;
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
    customerPhone: s.customer.phone,
    totalAmount: s.totalAmount.toString(),
    paidAmount: s.paidAmount.toString(),
    outstanding: s.outstanding.toString(),
    notes: s.notes,
    date: s.date,
    voidedAt: s.voidedAt,
  }));
}

/** Fetch one sale with items + customer info. */
export async function getSale(id: string): Promise<SaleWithItems> {
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
  return {
    ...toView(sale),
    customerName: sale.customer.name,
    customerPhone: sale.customer.phone,
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
 *  5. Create Sale + nested SaleItems (atomic in prisma.$transaction)
 *  6. If paidAmount > 0, create a Payment row linked to the sale
 *  7. Write 1-2 Transaction ledger rows (sale + optional payment)
 *
 *  Stock is automatically reduced because SaleItem rows exist.
 *  No separate StockMove is needed.
 */
export async function createSale(input: unknown): Promise<SaleWithItems> {
  const data = createSaleSchema.parse(input);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Validate customer exists
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId, isDeleted: false },
    });
    if (!customer) {
      throw new NotFoundError("Customer", data.customerId);
    }

    // 2. Validate all products exist
    // Dedupe productIds first — if the same product appears twice in items,
    // the findMany would return 1 row but productIds would have 2 entries,
    // causing a misleading "Product not found" error on a duplicate.
    const uniqueProductIds = Array.from(new Set(data.items.map((i) => i.productId)));
    const products = await tx.product.findMany({
      where: { id: { in: uniqueProductIds }, isDeleted: false },
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

    // 5. Create Sale + nested SaleItems in one call
    const sale = await tx.sale.create({
      data: {
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
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    // 6. If money was paid at sale time, create a linked Payment
    let paymentId: string | null = null;
    if (paidAmount.gt(0)) {
      const payment = await tx.payment.create({
        data: {
          customerId: data.customerId,
          saleId: sale.id,
          amount: paidAmount,
          method: data.paymentMethod ?? "cash",
          date: saleDate,
        },
      });
      paymentId = payment.id;
    }

    // 7. Write Transaction ledger rows (batched — 1 createMany instead of 2 creates)
    const txRows: Array<{
      type: string;
      refType: string;
      refId: string;
      customerId: string;
      amount: typeof totalAmount;
      direction: string;
      date: Date;
      notes: string | null;
    }> = [{
      type: "sale",
      refType: "Sale",
      refId: sale.id,
      customerId: data.customerId,
      amount: totalAmount,
      direction: "debit",
      date: saleDate,
      notes: `Sale ${sale.id}`,
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
      });
    }

    await tx.transaction.createMany({ data: txRows });

    return sale;
  });

  // Re-fetch with customer relation for the response.
  const withCustomer = await prisma.sale.findUniqueOrThrow({
    where: { id: result.id },
    include: { customer: true },
  });

  return {
    ...toView(result),
    customerName: withCustomer.customer.name,
    customerPhone: withCustomer.customer.phone,
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
 *
 * Net effect on customer balance: (paidAmount - totalAmount).
 */
export async function voidSale(id: string): Promise<{ id: string; voidedAt: Date }> {
  return await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id },
      include: { payments: { where: { voidedAt: null } } },
    });
    if (!sale) throw new NotFoundError("Sale", id);
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
}
