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
import { recordAudit } from "@/lib/services/audit";
import {
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
  getDateRangeForFilter,
} from "@/lib/utils/date";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

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

export type PaymentFilter = "today" | "yesterday" | "week" | "lastWeek" | "month" | "lastMonth" | "year" | "all";

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
export async function listPayments(limit = 50, userId?: string | null): Promise<PaymentView[]> {
  const payments = await prisma.payment.findMany({
    where: { voidedAt: null, ...(userId && { userId }) },
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
  userId?: string | null,
): Promise<PaymentListItem[]> {
  const { customerId, limit = 100, timezone = "Asia/Karachi" } = options;
  const range = getDateRangeForFilter(filter, timezone);

  const payments = await prisma.payment.findMany({
    where: {
      voidedAt: null,
      ...(userId && { userId }),
      ...((range.start || range.end) && {
        date: {
          ...(range.start && { gte: range.start }),
          ...(range.end && { lt: range.end }),
        },
      }),
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
export async function listPaymentsByCustomer(customerId: string, userId?: string | null): Promise<PaymentView[]> {
  const payments = await prisma.payment.findMany({
    where: { customerId, voidedAt: null, ...(userId && { userId }) },
    orderBy: { date: "desc" },
  });
  return payments.map(toView);
}

/** Fetch one payment WITH customer info. */
export async function getPayment(id: string, userId?: string | null): Promise<PaymentDetail> {
  const payment = await prisma.payment.findFirst({
    where: { id, ...(userId && { userId }) },
    include: { customer: true },
  });
  if (!payment || payment.voidedAt) {
    throw new NotFoundError("api.resource.payment", id);
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
export async function recordPayment(input: unknown, userId?: string | null): Promise<PaymentDetail> {
  const data = createPaymentSchema.parse(input);

  const payment = await prisma.$transaction(async (tx) => {
    // Tenant isolation: customer must belong to the authenticated user
    // (or be a legacy null-userId customer).
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
      throw new NotFoundError("api.resource.customer", data.customerId);
    }

    if (data.saleId) {
      // Tenant isolation: sale must belong to the authenticated user.
      const sale = await tx.sale.findFirst({
        where: {
          id: data.saleId,
          ...(userId && {
            OR: [{ userId }, { userId: null }],
          }),
        },
      });
      if (!sale || sale.voidedAt) {
        throw new NotFoundError("api.resource.sale", data.saleId);
      }
      if (sale.customerId !== data.customerId) {
        throw new BadRequestError("api.payment.saleCustomerMismatch");
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
        ...(userId && { userId }),
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
        ...(userId && { userId }),
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

  if (userId) {
    await recordAudit(userId, {
      action: "payment.create",
      entityType: "Payment",
      entityId: payment.id,
      summary: `Payment from ${withCustomer.customer.name}`,
      metadata: {
        amount: payment.amount.toString(),
        method: payment.method,
        customerId: payment.customerId,
        saleId: payment.saleId,
      },
    });
  }

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
export async function voidPayment(id: string, userId?: string | null): Promise<{ id: string; voidedAt: Date }> {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id, ...(userId && { userId }) } });
    if (!payment) throw new NotFoundError("api.resource.payment", id);
    if (payment.voidedAt) throw new BadRequestError("api.payment.alreadyVoided");

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

  if (userId) {
    await recordAudit(userId, {
      action: "payment.void",
      entityType: "Payment",
      entityId: id,
      summary: "Voided a payment",
      metadata: { voidedAt: result.voidedAt.toISOString() },
    });
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// V2 — Update payment (amount / method / date / notes)
// ────────────────────────────────────────────────────────────────────────────
//
// Editing is restricted to: amount, method, date, notes. The customer + saleId
// are NOT editable (changing the customer would be a different payment — the
// owner should void + re-record).
//
// If the payment is linked to a sale AND the amount changes, the sale's
// denormalized paidAmount + outstanding columns are recomputed (in the same
// transaction) so they stay consistent.
//
// Atomic: all changes (Payment row + Transaction ledger row + Sale columns)
// happen in one prisma.$transaction. If any step fails, all roll back.

export type UpdatePaymentInput = {
  amount?: number | string;
  method?: "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other";
  notes?: string | null;
  date?: string;
};

export async function updatePayment(
  id: string,
  input: unknown,
  userId?: string | null,
): Promise<PaymentDetail> {
  // Verify ownership first — throws 404 if not owned by this user / voided.
  const existing = await getPayment(id, userId);

  // Zod-validate the input
  const schema = z.object({
    amount: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === "string" ? Number(v) : v))
      .refine((v) => Number.isFinite(v) && v > 0, "api.payment.amountMustBePositive")
      .optional(),
    method: z.enum(["cash", "bank", "cheque", "jazzcash", "easypaisa", "other"]).optional(),
    notes: z.string().trim().max(500).optional().nullable(),
    date: z.string().datetime().optional(),
  });
  const data = schema.parse(input);

  const result = await prisma.$transaction(async (tx) => {
    // If amount changes AND the payment is linked to a sale, recompute the
    // sale's denormalized paidAmount + outstanding columns.
    let newSalePaidAmount: Decimal | undefined;
    let newSaleOutstanding: Decimal | undefined;
    if (data.amount !== undefined && existing.saleId) {
      const sale = await tx.sale.findUnique({ where: { id: existing.saleId } });
      if (sale && !sale.voidedAt) {
        // Recompute from the source of truth: SUM of all non-voided payments
        // for this sale (excluding the current payment, then re-adding the
        // new amount). This avoids drift if other payments were edited
        // concurrently.
        const otherPayments = await tx.payment.aggregate({
          _sum: { amount: true },
          where: {
            saleId: sale.id,
            voidedAt: null,
            id: { not: id },
          },
        });
        const otherSum = otherPayments._sum.amount
          ? new Decimal(otherPayments._sum.amount.toString())
          : new Decimal(0);
        newSalePaidAmount = otherSum.plus(new Decimal(data.amount));
        newSaleOutstanding = sale.totalAmount.minus(newSalePaidAmount);
      }
    }

    // Update the Payment row
    const updated = await tx.payment.update({
      where: { id },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.method !== undefined && { method: data.method }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
      },
    });

    // Update the Transaction ledger row (keep in sync)
    await tx.transaction.updateMany({
      where: { refType: "Payment", refId: id },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
      },
    });

    // Update the Sale's denormalized columns (if recomputed above)
    if (existing.saleId && newSalePaidAmount !== undefined && newSaleOutstanding !== undefined) {
      await tx.sale.update({
        where: { id: existing.saleId },
        data: {
          paidAmount: newSalePaidAmount.lt(0) ? new Decimal(0) : newSalePaidAmount,
          outstanding: newSaleOutstanding.lt(0) ? new Decimal(0) : newSaleOutstanding,
        },
      });
    }

    return updated;
  });

  // Invalidate caches (a payment change affects customer balance, dashboard,
  // sale detail if linked, P&L).
  invalidateCache("customers");
  invalidateCache("dashboard");
  invalidateCache("sales");
  invalidateCache("profit-loss");

  // Re-fetch with customer relation for the response.
  const withCustomer = await prisma.payment.findUniqueOrThrow({
    where: { id: result.id },
    include: { customer: true },
  });

  if (userId) {
    await recordAudit(userId, {
      action: "payment.update",
      entityType: "Payment",
      entityId: result.id,
      summary: `Updated a payment from ${withCustomer.customer.name}`,
      metadata: {
        amount: withCustomer.amount.toString(),
        method: withCustomer.method,
      },
    });
  }

  return {
    ...toView(withCustomer),
    customerName: withCustomer.customer.name,
    customerPhone: withCustomer.customer.phone ?? null,
  };
}
