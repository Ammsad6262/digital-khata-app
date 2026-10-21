/**
 * SupplierPayment service layer — money PAID to a supplier.
 *
 * Each payment also writes a Transaction ledger row (type = "supplier_payment",
 * direction = "credit" = money out) so payments appear in the transaction
 * history. The ledger row is deleted when the payment is voided.
 *
 * Payable is derived (services/suppliers.ts):
 *   opening + SUM(purchase.outstanding) − SUM(supplierPayment.amount)
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { invalidateCache } from "@/lib/utils/cache";
import { createSupplierPaymentSchema } from "@/lib/schemas/supplier-payment";
import { getSupplier } from "@/lib/services/suppliers";
import type { Prisma } from "@prisma/client";

const paymentInclude = {
  supplier: { select: { name: true } },
} satisfies Prisma.SupplierPaymentInclude;

type PaymentRow = Prisma.SupplierPaymentGetPayload<{ include: typeof paymentInclude }>;

export type SupplierPaymentView = {
  id: string;
  supplierId: string;
  supplierName: string | null;
  purchaseId: string | null;
  amount: string;
  method: string;
  notes: string | null;
  date: Date;
  voidedAt: Date | null;
  createdAt: Date;
};

function toView(p: PaymentRow): SupplierPaymentView {
  return {
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplier?.name ?? null,
    purchaseId: p.purchaseId,
    amount: p.amount.toString(),
    method: p.method,
    notes: p.notes,
    date: p.date,
    voidedAt: p.voidedAt,
    createdAt: p.createdAt,
  };
}

/** List payments made to one supplier (newest first). */
export async function listSupplierPayments(
  supplierId: string,
  userId?: string | null,
): Promise<SupplierPaymentView[]> {
  await getSupplier(supplierId, userId);
  const rows = await prisma.supplierPayment.findMany({
    where: { supplierId, ...(userId && { userId }) },
    include: paymentInclude,
    orderBy: { date: "desc" },
    take: 200,
  });
  return rows.map(toView);
}

/** Fetch one payment (404 if not found / not owned). */
export async function getSupplierPayment(
  id: string,
  userId?: string | null,
): Promise<SupplierPaymentView> {
  const row = await prisma.supplierPayment.findFirst({
    where: { id, ...(userId && { userId }) },
    include: paymentInclude,
  });
  if (!row) throw new NotFoundError("api.resource.supplierPayment", id);
  return toView(row);
}

/**
 * Record a payment to a supplier. Atomic (payment + ledger).
 *
 * Guards:
 *   - supplier must belong to this tenant
 *   - if linked to an invoice, that invoice must belong to the same supplier
 *     and the payment cannot exceed what is still owed on it
 *   - identical payment within the last 60s is rejected (double-submit guard)
 */
export async function createSupplierPayment(
  input: unknown,
  userId?: string | null,
): Promise<SupplierPaymentView> {
  const data = createSupplierPaymentSchema.parse(input);

  const created = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: data.supplierId, isDeleted: false, ...(userId && { userId }) },
      select: { id: true, name: true, openingBalance: true },
    });
    if (!supplier) throw new NotFoundError("api.resource.supplier", data.supplierId);

    const amount = new Decimal(data.amount);

    if (data.purchaseId) {
      const purchase = await tx.purchase.findFirst({
        where: {
          id: data.purchaseId,
          supplierId: data.supplierId,
          voidedAt: null,
          ...(userId && { userId }),
        },
        select: { id: true, outstanding: true },
      });
      if (!purchase) throw new NotFoundError("api.resource.purchase", data.purchaseId);

      const alreadyPaid = await tx.supplierPayment.aggregate({
        _sum: { amount: true },
        where: { purchaseId: purchase.id, voidedAt: null },
      });
      const remaining = toDecimalOrZero(purchase.outstanding).minus(
        toDecimalOrZero(alreadyPaid._sum.amount),
      );
      if (amount.greaterThan(remaining)) {
        throw new BadRequestError("api.supplierPayment.exceedsOutstanding", undefined, {
          remaining: remaining.toString(),
        });
      }
    } else {
      // No invoice specified → the payment is against the supplier's overall
      // payable. It must not exceed what is currently owed, otherwise the
      // balance would silently go negative (an "advance" this app cannot
      // represent). Record the purchase first if you are paying up front.
      const [purchaseSum, paidSum] = await Promise.all([
        tx.purchase.aggregate({
          _sum: { outstanding: true },
          where: {
            supplierId: data.supplierId,
            voidedAt: null,
            ...(userId && { userId }),
          },
        }),
        tx.supplierPayment.aggregate({
          _sum: { amount: true },
          where: {
            supplierId: data.supplierId,
            voidedAt: null,
            ...(userId && { userId }),
          },
        }),
      ]);

      const payable = toDecimalOrZero(supplier.openingBalance)
        .plus(toDecimalOrZero(purchaseSum._sum.outstanding))
        .minus(toDecimalOrZero(paidSum._sum.amount));

      if (amount.greaterThan(payable)) {
        throw new BadRequestError("api.supplierPayment.exceedsPayable", undefined, {
          payable: payable.toString(),
        });
      }
    }

    const paymentDate = data.date ?? new Date();

    const recent = await tx.supplierPayment.findFirst({
      where: {
        supplierId: data.supplierId,
        amount,
        method: data.method,
        voidedAt: null,
        createdAt: { gte: new Date(Date.now() - 60_000) },
        ...(userId && { userId }),
      },
      select: { id: true },
    });
    if (recent) throw new BadRequestError("api.duplicateTransaction");

    const payment = await tx.supplierPayment.create({
      data: {
        ...(userId && { userId }),
        supplierId: data.supplierId,
        purchaseId: data.purchaseId ?? null,
        amount,
        method: data.method,
        notes: data.notes ?? null,
        date: paymentDate,
      },
    });

    await tx.transaction.create({
      data: {
        ...(userId && { userId }),
        type: "supplier_payment",
        refType: "SupplierPayment",
        refId: payment.id,
        supplierId: data.supplierId,
        amount,
        direction: "credit", // money out
        notes: `Payment to ${supplier.name}`,
        date: paymentDate,
      },
    });

    return tx.supplierPayment.findUniqueOrThrow({
      where: { id: payment.id },
      include: paymentInclude,
    });
  });

  invalidateCache("suppliers");
  invalidateCache("dashboard");
  invalidateCache("transactions");
  return toView(created);
}

/** Void a payment — atomic (marks void + removes its ledger row). */
export async function voidSupplierPayment(
  id: string,
  userId?: string | null,
): Promise<{ id: string; voidedAt: Date }> {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.findFirst({
      where: { id, ...(userId && { userId }) },
    });
    if (!payment) throw new NotFoundError("api.resource.supplierPayment", id);
    if (payment.voidedAt) throw new BadRequestError("api.supplierPayment.alreadyVoided");

    const now = new Date();
    await tx.supplierPayment.update({ where: { id }, data: { voidedAt: now } });
    await tx.transaction.deleteMany({
      where: { refType: "SupplierPayment", refId: id },
    });
    return { id, voidedAt: now };
  });

  invalidateCache("suppliers");
  invalidateCache("dashboard");
  invalidateCache("transactions");
  return result;
}
