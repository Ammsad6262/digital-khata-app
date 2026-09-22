/**
 * Payment service layer.
 *
 * A payment is money received from a customer. It decreases their balance.
 * Atomic: writes Payment + Transaction row in the same prisma.$transaction.
 *
 * OVERPAYMENT POLICY (documented in docs/EDGE_CASES.md):
 *   Payments that exceed the customer's outstanding balance are ALLOWED.
 *   The balance goes negative — representing the business's liability to
 *   the customer (an "advance payment"). The UI shows this as a blue
 *   "Advance payment" badge everywhere balances are displayed.
 *
 *   Validation only blocks:
 *     - amount <= 0
 *     - non-existent customer
 *     - malformed data (failed Zod)
 *
 *   It does NOT block:
 *     - amount > outstanding (allowed → creates advance credit)
 *     - payment when outstanding is 0 (allowed → creates advance credit)
 */

import { prisma } from "@/lib/db/prisma";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { createPaymentSchema } from "@/lib/schemas/payment";
import { Decimal } from "@/lib/utils/decimal";
import { invalidateCache } from "@/lib/utils/cache";
import {
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
} from "@/lib/utils/date";
import type { Prisma } from "@prisma/client";

// ────────────────────────────────────────────────────────────────────────────
// View types
// ────────────────────────────────────────────────────────────────────────────

export type PaymentView = {
  id: string;
  customerId: string;
  saleId: string | null;
  amount: string;
  method: string;
  notes: string | null;
  date: Date;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentListItem = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  saleId: string | null;
  amount: string;
  method: string;
  notes: string | null;
  date: Date;
  voidedAt: Date | null;
};

export type PaymentDetail = PaymentView & {
  customerName: string;
  customerPhone: string | null;
};

export type PaymentFilter = "today" | "week" | "month" | "all";

// ────────────────────────────────────────────────────────────────────────────
// Mappers
// ────────────────────────────────────────────────────────────────────────────

function toView(p: Prisma.PaymentGetPayload<{}>): PaymentView {
  return {
    id: p.id,
    customerId: p.customerId,
    saleId: p.saleId,
    amount: p.amount.toString(),
    method: p.method,
    notes: p.notes,
    date: p.date,
    voidedAt: p.voidedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// List + detail
// ────────────────────────────────────────────────────────────────────────────

/** List recent payments (default: last 50, active only). */
export async function listPayments(limit = 50): Promise<PaymentView[]> {
  const payments = await prisma.payment.findMany({
    where: { voidedAt: null },
    orderBy: { date: "desc" },
    take: limit,
  });
  return payments.map(toView);
}

/**
 * List payments (lightweight — no sale join unless needed) with date filtering.
 * Includes customer name + phone for the Payments list page.
 *
 * Filter:
 *   today → payments where date >= start of today (in business TZ)
 *   week  → payments where date >= start of week (Monday)
 *   month → payments where date >= start of month
 *   all   → no date filter (still excludes voided)
 */
export async function listPaymentsFiltered(
  filter: PaymentFilter = "all",
  options: {
    customerId?: string;
    limit?: number;
    timezone?: string;
  } = {},
): Promise<PaymentListItem[]> {
  const { customerId, limit = 100, timezone = "Asia/Karachi" } = options;
  let startDate: Date | undefined;

  switch (filter) {
    case "today": startDate = startOfTodayInTz(timezone); break;
    case "week":  startDate = startOfWeekInTz(timezone); break;
    case "month": startDate = startOfMonthInTz(timezone); break;
    case "all":   startDate = undefined; break;
  }

  const payments = await prisma.payment.findMany({
    where: {
      voidedAt: null,
      ...(startDate && { date: { gte: startDate } }),
      ...(customerId && { customerId }),
    },
    include: { customer: true },
    orderBy: { date: "desc" },
    take: limit,
  });

  return payments.map((p) => ({
    id: p.id,
    customerId: p.customerId,
    customerName: p.customer.name,
    customerPhone: p.customer.phone ?? null,
    saleId: p.saleId,
    amount: p.amount.toString(),
    method: p.method,
    notes: p.notes,
    date: p.date,
    voidedAt: p.voidedAt,
  }));
}

/** List payments for a specific customer. */
export async function listPaymentsByCustomer(customerId: string): Promise<PaymentView[]> {
  const payments = await prisma.payment.findMany({
    where: { customerId, voidedAt: null },
    orderBy: { date: "desc" },
  });
  return payments.map(toView);
}

/** Fetch one payment WITH customer info. */
export async function getPayment(id: string): Promise<PaymentDetail> {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { customer: true },
  });
  if (!payment || payment.voidedAt) {
    throw new NotFoundError("Payment", id);
  }
  return {
    ...toView(payment),
    customerName: payment.customer.name,
    customerPhone: payment.customer.phone ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Create + void
// ────────────────────────────────────────────────────────────────────────────

/**
 * Record a payment — atomic with the Transaction ledger row.
 *
 * Throws:
 *   - NotFoundError if customer doesn't exist
 *   - BadRequestError if saleId is provided but doesn't belong to the customer
 *
 * Does NOT throw on overpayment (allowed by design — see policy above).
 */
export async function recordPayment(input: unknown): Promise<PaymentDetail> {
  const data = createPaymentSchema.parse(input);

  const payment = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId, isDeleted: false },
    });
    if (!customer) {
      throw new NotFoundError("Customer", data.customerId);
    }

    if (data.saleId) {
      const sale = await tx.sale.findUnique({ where: { id: data.saleId } });
      if (!sale || sale.voidedAt) {
        throw new NotFoundError("Sale", data.saleId);
      }
      if (sale.customerId !== data.customerId) {
        throw new BadRequestError("Sale does not belong to this customer.");
      }
      // Update the sale's denormalized paidAmount/outstanding columns so they
      // stay consistent with the actual payment records. Without this, the
      // sale detail page + business summary would show stale numbers.
      const newPaid = sale.paidAmount.plus(new Decimal(data.amount));
      const newOutstanding = sale.totalAmount.minus(newPaid);
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          outstanding: newOutstanding.lt(0) ? new Decimal(0) : newOutstanding,
        },
      });
    }

    const created = await tx.payment.create({
      data: {
        customerId: data.customerId,
        saleId: data.saleId ?? null,
        amount: data.amount,
        method: data.method,
        notes: data.notes ?? null,
        date: data.date ? new Date(data.date) : new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        type: "payment",
        refType: "Payment",
        refId: created.id,
        customerId: data.customerId,
        amount: data.amount,
        direction: "credit", // decreases customer balance
        date: created.date,
      },
    });

    return created;
  });

  // Invalidate caches (payment affects customers, dashboard, P&L, sales if linked)
  invalidateCache("customers");
  invalidateCache("dashboard");
  invalidateCache("sales");
  invalidateCache("profit-loss");

  // Re-fetch with customer relation for the response.
  const withCustomer = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
    include: { customer: true },
  });

  return {
    ...toView(withCustomer),
    customerName: withCustomer.customer.name,
    customerPhone: withCustomer.customer.phone ?? null,
  };
}

/**
 * Void a payment — atomic + cleans up the Transaction mirror + reverses
 * the sale's denormalized paidAmount/outstanding if linked.
 */
export async function voidPayment(id: string): Promise<{ id: string; voidedAt: Date }> {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundError("Payment", id);
    if (payment.voidedAt) throw new BadRequestError("Payment is already voided.");

    const now = new Date();

    await tx.payment.update({
      where: { id },
      data: { voidedAt: now },
    });

    // If this payment was linked to a sale, reverse the sale's denormalized
    // paidAmount/outstanding columns so they stay consistent.
    // IMPORTANT: recompute outstanding from totalAmount - newPaid (the source of truth),
    // NOT by adding payment.amount back to the current outstanding. The current outstanding
    // may have been clamped to 0 by a previous overpayment, so arithmetic reversal
    // would produce a wrong number.
    if (payment.saleId) {
      const sale = await tx.sale.findUnique({ where: { id: payment.saleId } });
      if (sale && !sale.voidedAt) {
        const newPaid = sale.paidAmount.minus(payment.amount);
        const newOutstanding = sale.totalAmount.minus(newPaid);
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            paidAmount: newPaid.lt(0) ? new Decimal(0) : newPaid,
            outstanding: newOutstanding.lt(0) ? new Decimal(0) : newOutstanding,
          },
        });
      }
    }

    // Delete the Transaction ledger row for this payment.
    await tx.transaction.deleteMany({
      where: { refType: "Payment", refId: id },
    });

    return { id, voidedAt: now };
  });

  // Invalidate caches
  invalidateCache("customers");
  invalidateCache("dashboard");
  invalidateCache("sales");
  invalidateCache("profit-loss");

  return result;
}
