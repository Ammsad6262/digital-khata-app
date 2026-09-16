/**
 * Payment service layer.
 *
 * A payment is money received from a customer. It decreases their balance.
 * Atomic: writes Payment + Transaction row in the same prisma.$transaction.
 */

import { prisma } from "@/lib/db/prisma";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { createPaymentSchema } from "@/lib/schemas/payment";
import type { Prisma } from "@prisma/client";

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

/** List recent payments (default: last 50, active only). */
export async function listPayments(limit = 50): Promise<PaymentView[]> {
  const payments = await prisma.payment.findMany({
    where: { voidedAt: null },
    orderBy: { date: "desc" },
    take: limit,
  });
  return payments.map(toView);
}

/** List payments for a specific customer. */
export async function listPaymentsByCustomer(customerId: string): Promise<PaymentView[]> {
  const payments = await prisma.payment.findMany({
    where: { customerId, voidedAt: null },
    orderBy: { date: "desc" },
  });
  return payments.map(toView);
}

/** Fetch one payment. */
export async function getPayment(id: string): Promise<PaymentView> {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment || payment.voidedAt) {
    throw new NotFoundError("Payment", id);
  }
  return toView(payment);
}

/** Record a payment — atomic with the Transaction ledger row. */
export async function recordPayment(input: unknown): Promise<PaymentView> {
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
        direction: "credit",
        date: created.date,
      },
    });

    return created;
  });

  return toView(payment);
}

/** Void a payment (sets voidedAt, excludes it from balance calc). */
export async function voidPayment(id: string): Promise<{ id: string; voidedAt: Date }> {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new NotFoundError("Payment", id);
  if (payment.voidedAt) throw new BadRequestError("Payment is already voided.");

  const now = new Date();
  await prisma.payment.update({
    where: { id },
    data: { voidedAt: now },
  });

  return { id, voidedAt: now };
}
