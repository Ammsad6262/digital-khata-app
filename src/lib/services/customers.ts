/**
 * Customer service layer.
 *
 * Single source of truth for "how to create / list / fetch a customer" and
 * "how to compute a customer's outstanding balance."
 *
 * The customer balance is DERIVED — it's never stored on the Customer row.
 * Formula:
 *
 *   openingBalance
 *   + SUM(sale.totalAmount      WHERE voidedAt IS NULL)
 *   - SUM(payment.amount        WHERE voidedAt IS NULL)
 *   + SUM(adjustment.amount     WHERE voidedAt IS NULL)
 *   = current balance
 *
 * (positive = customer owes; negative = advance payment)
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { NotFoundError } from "@/lib/errors";
import { createCustomerSchema, updateCustomerSchema } from "@/lib/schemas/customer";
import type { Prisma } from "@prisma/client";

/** Public-facing shape — never leak isDeleted, internal timestamps. */
export type CustomerView = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
  openingBalance: string; // string for JSON-safe serialization
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerWithBalance = CustomerView & {
  balance: string; // signed Decimal as string
  totalPurchases: string;
  totalPayments: string;
  totalAdjustments: string;
};

function toView(c: Prisma.CustomerGetPayload<{}>): CustomerView {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    notes: c.notes,
    openingBalance: c.openingBalance.toString(),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** List all active customers (isDeleted = false), sorted by name. */
export async function listCustomers(): Promise<CustomerView[]> {
  const customers = await prisma.customer.findMany({
    where: { isDeleted: false },
    orderBy: { name: "asc" },
  });
  return customers.map(toView);
}

/** Fetch one customer by ID, throw 404 if not found / soft-deleted. */
export async function getCustomer(id: string): Promise<CustomerView> {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || customer.isDeleted) {
    throw new NotFoundError("Customer", id);
  }
  return toView(customer);
}

/**
 * Compute a customer's outstanding balance + the components that feed into it.
 * Returns all values as strings (JSON-safe Decimal serialization).
 */
export async function getCustomerBalance(customerId: string): Promise<{
  openingBalance: string;
  totalPurchases: string;
  totalPayments: string;
  totalAdjustments: string;
  balance: string; // signed
}> {
  const [customer, salesAgg, paymentsAgg, adjustmentsAgg] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { customerId, voidedAt: null },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { customerId, voidedAt: null },
    }),
    prisma.customerAdjustment.aggregate({
      _sum: { amount: true },
      where: { customerId, voidedAt: null },
    }),
  ]);

  const opening = toDecimalOrZero(customer.openingBalance);
  const sales = toDecimalOrZero(salesAgg._sum.totalAmount);
  const payments = toDecimalOrZero(paymentsAgg._sum.amount);
  const adjustments = toDecimalOrZero(adjustmentsAgg._sum.amount);

  const balance = opening.plus(sales).minus(payments).plus(adjustments);

  return {
    openingBalance: opening.toString(),
    totalPurchases: sales.toString(),
    totalPayments: payments.toString(),
    totalAdjustments: adjustments.toString(),
    balance: balance.toString(),
  };
}

/** Fetch one customer with their balance precomputed. */
export async function getCustomerWithBalance(id: string): Promise<CustomerWithBalance> {
  const [customerView, balance] = await Promise.all([
    getCustomer(id),
    getCustomerBalance(id),
  ]);
  return { ...customerView, ...balance };
}

/**
 * List customers who currently owe money (balance > 0), sorted by balance desc.
 * Returns id, name, phone, balance.
 *
 * Note: this is more expensive than `listCustomers` because we need to compute
 * the balance per customer. For V1 with a single small business this is fine;
 * for V2 scale we'd denormalize into a CustomerBalance view.
 */
export async function listOutstandingCustomers(): Promise<
  Array<{ id: string; name: string; phone: string; balance: string }>
> {
  const customers = await prisma.customer.findMany({
    where: { isDeleted: false },
    orderBy: { name: "asc" },
  });

  const withBalances = await Promise.all(
    customers.map(async (c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      balance: (await getCustomerBalance(c.id)).balance,
    })),
  );

  // Filter out non-positive balances and sort by balance descending.
  return withBalances
    .filter((c) => new Decimal(c.balance).gt(0))
    .sort((a, b) => new Decimal(b.balance).minus(a.balance).toNumber());
}

/** Create a new customer. Throws ConflictError on duplicate phone (via Prisma P2002 → fail()). */
export async function createCustomer(input: unknown): Promise<CustomerView> {
  const data = createCustomerSchema.parse(input);
  const customer = await prisma.customer.create({
    data: {
      name: data.name,
      phone: data.phone,
      address: data.address ?? null,
      notes: data.notes ?? null,
      openingBalance: data.openingBalance,
    },
  });
  return toView(customer);
}

/** Update a customer. */
export async function updateCustomer(id: string, input: unknown): Promise<CustomerView> {
  // Throws if not found / deleted.
  await getCustomer(id);
  const data = updateCustomerSchema.parse(input);

  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.notes !== undefined && { notes: data.notes }),
      // openingBalance is intentionally NOT updatable — set once at creation.
      // Use CustomerAdjustment to correct it.
    },
  });

  return toView(updated);
}

/** Soft-delete a customer (V1: just flags; hard delete is blocked in API). */
export async function deleteCustomer(id: string): Promise<{ id: string; deleted: true }> {
  // Block soft-delete if customer has any transactions.
  const [saleCount, paymentCount] = await Promise.all([
    prisma.sale.count({ where: { customerId: id } }),
    prisma.payment.count({ where: { customerId: id } }),
  ]);
  if (saleCount > 0 || paymentCount > 0) {
    throw new Error(
      `Cannot delete customer with ${saleCount} sales and ${paymentCount} payments. Void or transfer them first.`,
    );
  }

  await prisma.customer.update({
    where: { id },
    data: { isDeleted: true },
  });

  return { id, deleted: true };
}
