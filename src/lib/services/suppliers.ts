/**
 * Supplier service layer.
 *
 * Mirrors the customer service. The amount the business OWES a supplier is
 * DERIVED, never stored on the Supplier row:
 *
 *   openingBalance
 *   + SUM(purchase.totalAmount      WHERE voidedAt IS NULL)
 *   - SUM(supplierPayment.amount    WHERE voidedAt IS NULL)
 *   = payable (positive = we owe the supplier; negative = advance paid)
 *
 * Every read is scoped by `userId` so one business can never see another's
 * suppliers, purchases or payments.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { cached, invalidateCache } from "@/lib/utils/cache";
import { recordAudit } from "@/lib/services/audit";
import { createSupplierSchema, updateSupplierSchema } from "@/lib/schemas/supplier";
import type { Prisma } from "@prisma/client";

/** Public-facing shape — never leak isDeleted, internal fields. */
export type SupplierView = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  openingBalance: string;
  nextFollowUpAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SupplierWithBalance = SupplierView & {
  balance: string; // signed: positive = we owe the supplier
  totalPurchases: string;
  totalOutstanding: string;
  totalPayments: string;
};

function toView(s: Prisma.SupplierGetPayload<{}>): SupplierView {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone ?? null,
    email: s.email ?? null,
    address: s.address,
    notes: s.notes,
    openingBalance: s.openingBalance.toString(),
    nextFollowUpAt: s.nextFollowUpAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** List all active suppliers (isDeleted = false), sorted by name. */
export async function listSuppliers(userId?: string | null): Promise<SupplierView[]> {
  const suppliers = await prisma.supplier.findMany({
    where: { isDeleted: false, ...(userId && { userId }) },
    orderBy: { name: "asc" },
  });
  return suppliers.map(toView);
}

/** Fetch one supplier by ID, throw 404 if not found / soft-deleted / not owned. */
export async function getSupplier(id: string, userId?: string | null): Promise<SupplierView> {
  const supplier = await prisma.supplier.findFirst({
    where: { id, isDeleted: false, ...(userId && { userId }) },
  });
  if (!supplier) {
    throw new NotFoundError("api.resource.supplier", id);
  }
  return toView(supplier);
}

/**
 * Compute what the business owes a supplier + the components.
 * All numeric values are strings (JSON-safe Decimal serialization).
 */
export async function getSupplierBalance(supplierId: string): Promise<{
  openingBalance: string;
  totalPurchases: string;
  totalOutstanding: string;
  totalPayments: string;
  balance: string;
}> {
  const [supplier, purchasesAgg, paymentsAgg] = await Promise.all([
    prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true, outstanding: true },
      where: { supplierId, voidedAt: null },
    }),
    prisma.supplierPayment.aggregate({
      _sum: { amount: true },
      where: { supplierId, voidedAt: null },
    }),
  ]);

  const opening = toDecimalOrZero(supplier.openingBalance);
  const purchases = toDecimalOrZero(purchasesAgg._sum.totalAmount);
  const outstanding = toDecimalOrZero(purchasesAgg._sum.outstanding);
  const payments = toDecimalOrZero(paymentsAgg._sum.amount);
  // Money owed = opening + unpaid part of purchases − payments made since.
  const balance = opening.plus(outstanding).minus(payments);

  return {
    openingBalance: opening.toString(),
    totalPurchases: purchases.toString(),
    totalOutstanding: outstanding.toString(),
    totalPayments: payments.toString(),
    balance: balance.toString(),
  };
}

/** List suppliers with their current payable, computed in batch (no N+1). */
export async function listSuppliersWithBalance(
  userId?: string | null,
): Promise<SupplierWithBalance[]> {
  const cacheKey = `suppliers:list-with-balance:${userId ?? "all"}`;
  return cached(cacheKey, async () => {
    const suppliers = await prisma.supplier.findMany({
      where: { isDeleted: false, ...(userId && { userId }) },
      orderBy: { name: "asc" },
    });
    if (suppliers.length === 0) return [];

    const supplierIds = suppliers.map((s) => s.id);

    const [purchasesBySupplier, paymentsBySupplier] = await Promise.all([
      prisma.purchase.groupBy({
        by: ["supplierId"],
        _sum: { totalAmount: true, outstanding: true },
        where: { supplierId: { in: supplierIds }, voidedAt: null },
      }),
      prisma.supplierPayment.groupBy({
        by: ["supplierId"],
        _sum: { amount: true },
        where: { supplierId: { in: supplierIds }, voidedAt: null },
      }),
    ]);

    const purchasesMap = new Map(
      purchasesBySupplier.map((p) => [p.supplierId, toDecimalOrZero(p._sum.totalAmount)]),
    );
    const outstandingMap = new Map(
      purchasesBySupplier.map((p) => [p.supplierId, toDecimalOrZero(p._sum.outstanding)]),
    );
    const paymentsMap = new Map(
      paymentsBySupplier.map((p) => [p.supplierId, toDecimalOrZero(p._sum.amount)]),
    );

    return suppliers.map((s) => {
      const opening = toDecimalOrZero(s.openingBalance);
      const purchases = purchasesMap.get(s.id) ?? new Decimal(0);
      const outstanding = outstandingMap.get(s.id) ?? new Decimal(0);
      const payments = paymentsMap.get(s.id) ?? new Decimal(0);
      return {
        ...toView(s),
        totalPurchases: purchases.toString(),
        totalOutstanding: outstanding.toString(),
        totalPayments: payments.toString(),
        balance: opening.plus(outstanding).minus(payments).toString(),
      };
    });
  });
}

/** Search suppliers by name OR phone (scoped to the owner). */
export async function searchSuppliers(
  query: string | null | undefined,
  userId?: string | null,
): Promise<SupplierWithBalance[]> {
  const q = (query ?? "").trim();
  if (q.length < 2) return [];

  const suppliers = await prisma.supplier.findMany({
    where: {
      isDeleted: false,
      ...(userId && { userId }),
      OR: [{ name: { contains: q } }, { phone: { contains: q } }],
    },
    orderBy: { name: "asc" },
    take: 50,
  });
  if (suppliers.length === 0) return [];

  const supplierIds = suppliers.map((s) => s.id);
  const [purchasesBySupplier, paymentsBySupplier] = await Promise.all([
    prisma.purchase.groupBy({
      by: ["supplierId"],
      _sum: { totalAmount: true, outstanding: true },
      where: { supplierId: { in: supplierIds }, voidedAt: null },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId"],
      _sum: { amount: true },
      where: { supplierId: { in: supplierIds }, voidedAt: null },
    }),
  ]);

  const purchasesMap = new Map(
    purchasesBySupplier.map((p) => [p.supplierId, toDecimalOrZero(p._sum.totalAmount)]),
  );
  const outstandingMap = new Map(
    purchasesBySupplier.map((p) => [p.supplierId, toDecimalOrZero(p._sum.outstanding)]),
  );
  const paymentsMap = new Map(
    paymentsBySupplier.map((p) => [p.supplierId, toDecimalOrZero(p._sum.amount)]),
  );

  return suppliers.map((s) => {
    const opening = toDecimalOrZero(s.openingBalance);
    const purchases = purchasesMap.get(s.id) ?? new Decimal(0);
    const outstanding = outstandingMap.get(s.id) ?? new Decimal(0);
    const payments = paymentsMap.get(s.id) ?? new Decimal(0);
    return {
      ...toView(s),
      totalPurchases: purchases.toString(),
      totalOutstanding: outstanding.toString(),
      totalPayments: payments.toString(),
      balance: opening.plus(outstanding).minus(payments).toString(),
    };
  });
}

/** Create a new supplier. */
export async function createSupplier(
  input: unknown,
  userId?: string | null,
): Promise<SupplierView> {
  const data = createSupplierSchema.parse(input);
  const supplier = await prisma.supplier.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      openingBalance: data.openingBalance,
      nextFollowUpAt: data.nextFollowUpAt ?? null,
      ...(userId && { userId }),
    },
  });
  invalidateCache("suppliers");
  invalidateCache("dashboard");

  if (userId) {
    await recordAudit(userId, {
      action: "supplier.create",
      entityType: "Supplier",
      entityId: supplier.id,
      summary: `Supplier: ${supplier.name}`,
      metadata: { phone: supplier.phone, openingBalance: supplier.openingBalance.toString() },
    });
  }

  return toView(supplier);
}

/** Update a supplier. openingBalance is NOT updatable — set once at creation. */
export async function updateSupplier(
  id: string,
  input: unknown,
  userId?: string | null,
): Promise<SupplierView> {
  await getSupplier(id, userId);
  const data = updateSupplierSchema.parse(input);

  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email ?? null }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.nextFollowUpAt !== undefined && { nextFollowUpAt: data.nextFollowUpAt }),
    },
  });
  invalidateCache("suppliers");
  invalidateCache("dashboard");

  if (userId) {
    await recordAudit(userId, {
      action: "supplier.update",
      entityType: "Supplier",
      entityId: updated.id,
      summary: `Updated supplier: ${updated.name}`,
      metadata: { phone: updated.phone },
    });
  }

  return toView(updated);
}

/** Soft-delete a supplier. Blocked if any purchases or payments exist. */
export async function deleteSupplier(
  id: string,
  userId?: string | null,
): Promise<{ id: string; deleted: true }> {
  const existing = await getSupplier(id, userId);

  const [purchaseCount, paymentCount] = await Promise.all([
    prisma.purchase.count({ where: { supplierId: id, voidedAt: null } }),
    prisma.supplierPayment.count({ where: { supplierId: id, voidedAt: null } }),
  ]);
  if (purchaseCount + paymentCount > 0) {
    throw new BadRequestError("api.supplier.deleteBlocked", undefined, {
      purchases: purchaseCount,
      payments: paymentCount,
    });
  }

  await prisma.supplier.update({ where: { id }, data: { isDeleted: true } });
  invalidateCache("suppliers");
  invalidateCache("dashboard");

  if (userId) {
    await recordAudit(userId, {
      action: "supplier.delete",
      entityType: "Supplier",
      entityId: id,
      summary: `Deleted supplier: ${existing.name}`,
      metadata: { phone: existing.phone },
    });
  }

  return { id, deleted: true };
}
