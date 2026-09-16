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

// ────────────────────────────────────────────────────────────────────────────
// Search
// ────────────────────────────────────────────────────────────────────────────

export type CustomerSearchResult = {
  id: string;
  name: string;
  phone: string;
  balance: string; // signed
};

/**
 * Search customers by name OR phone (case-insensitive contains).
 * Returns customers with their current balance precomputed.
 *
 * - Empty/null/whitespace query → returns all customers (sorted by name).
 * - Short query (< 2 chars) → returns empty list (avoid expensive LIKE scans).
 * - Results include balance so the UI can show it inline.
 */
export async function searchCustomers(query: string | null | undefined): Promise<CustomerSearchResult[]> {
  const q = (query ?? "").trim();

  // Empty query → list everything (the khata page initial state).
  if (q.length === 0) {
    return listAllCustomersWithBalance();
  }

  // Short query → no results (avoids accidental full-table matches).
  if (q.length < 2) {
    return [];
  }

  const customers = await prisma.customer.findMany({
    where: {
      isDeleted: false,
      OR: [
        { name: { contains: q } },
        { phone: { contains: q } },
      ],
    },
    orderBy: { name: "asc" },
    take: 50,
  });

  // Compute balances in parallel (each customer = 3 aggregate queries).
  const withBalances = await Promise.all(
    customers.map(async (c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      balance: (await getCustomerBalance(c.id)).balance,
    })),
  );

  return withBalances;
}

/** List ALL active customers with their current balance. Used by search("") and the khata list page. */
export async function listAllCustomersWithBalance(): Promise<CustomerSearchResult[]> {
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

  return withBalances;
}

// ────────────────────────────────────────────────────────────────────────────
// Customer transaction history with running balance
// ────────────────────────────────────────────────────────────────────────────

export type CustomerTransaction = {
  id: string;
  type: "sale" | "payment" | "adjustment";
  date: Date;
  amount: string; // always positive
  direction: "debit" | "credit"; // debit = customer owes more, credit = customer paid
  description: string;
  refId: string; // ID of source record (Sale.id, Payment.id, etc.)
  refType: string;
  runningBalance: string; // signed Decimal — customer's balance AFTER this transaction
};

export type CustomerHistory = {
  customer: CustomerWithBalance;
  transactions: CustomerTransaction[];
};

/**
 * Fetch a customer's complete transaction history with running balance.
 *
 * The running balance is computed chronologically:
 *   starting from 0
 *   + openingBalance (treated as a "starting" row)
 *   + each sale.totalAmount (debit)
 *   - each payment.amount (credit)
 *   + each adjustment.amount (signed)
 *
 * Voided sales/payments are EXCLUDED (they don't affect the balance).
 *
 * The final runningBalance of the last row equals the current customer balance,
 * which also equals the balance returned by getCustomerBalance() — this is the
 * consistency check that proves there are no conflicting calculations.
 */
export async function getCustomerHistory(customerId: string): Promise<CustomerHistory> {
  // Throws 404 if not found.
  const customer = await getCustomerWithBalance(customerId);

  // Fetch all active (non-voided) transactions in parallel.
  const [sales, payments, adjustments] = await Promise.all([
    prisma.sale.findMany({
      where: { customerId, voidedAt: null },
      select: {
        id: true,
        date: true,
        totalAmount: true,
        outstanding: true,
        notes: true,
      },
    }),
    prisma.payment.findMany({
      where: { customerId, voidedAt: null },
      select: {
        id: true,
        date: true,
        amount: true,
        method: true,
        notes: true,
        saleId: true,
      },
    }),
    prisma.customerAdjustment.findMany({
      where: { customerId, voidedAt: null },
      select: {
        id: true,
        date: true,
        amount: true,
        reason: true,
        notes: true,
      },
    }),
  ]);

  // Build a unified list of transactions.
  type RawTx = {
    id: string;
    type: CustomerTransaction["type"];
    date: Date;
    amount: Decimal;
    direction: CustomerTransaction["direction"];
    description: string;
    refId: string;
    refType: string;
  };

  const rawTxs: RawTx[] = [];

  for (const s of sales) {
    rawTxs.push({
      id: s.id,
      type: "sale",
      date: s.date,
      amount: toDecimalOrZero(s.totalAmount),
      direction: "debit",
      description: `Sale of ${toDecimalOrZero(s.totalAmount).toFixed(2)}`,
      refId: s.id,
      refType: "Sale",
    });
  }

  for (const p of payments) {
    rawTxs.push({
      id: p.id,
      type: "payment",
      date: p.date,
      amount: toDecimalOrZero(p.amount),
      direction: "credit",
      description: p.saleId ? `Payment for sale` : `Payment received (${p.method})`,
      refId: p.id,
      refType: "Payment",
    });
  }

  for (const a of adjustments) {
    const amount = toDecimalOrZero(a.amount);
    rawTxs.push({
      id: a.id,
      type: "adjustment",
      date: a.date,
      amount: amount.abs(),
      direction: amount.gte(0) ? "debit" : "credit",
      description: a.reason,
      refId: a.id,
      refType: "CustomerAdjustment",
    });
  }

  // Sort chronologically (oldest first) so running balance accumulates correctly.
  rawTxs.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compute running balance.
  // Start at 0, then add openingBalance, then apply each transaction.
  let running = new Decimal(0);
  const transactions: CustomerTransaction[] = [];

  // Insert the opening balance as the first "transaction" so the history
  // shows where the customer started. This makes the running balance visible
  // from day 1 and matches what the owner would expect from a paper khata.
  const openingBalance = toDecimalOrZero(customer.openingBalance);
  if (!openingBalance.isZero()) {
    running = running.plus(openingBalance);
    transactions.push({
      id: "opening",
      type: "adjustment",
      date: customer.createdAt,
      amount: openingBalance.abs().toString(),
      direction: openingBalance.gte(0) ? "debit" : "credit",
      description: "Opening balance",
      refId: customer.id,
      refType: "Customer",
      runningBalance: running.toString(),
    });
  }

  for (const tx of rawTxs) {
    if (tx.direction === "debit") {
      running = running.plus(tx.amount);
    } else {
      running = running.minus(tx.amount);
    }
    transactions.push({
      id: tx.id,
      type: tx.type,
      date: tx.date,
      amount: tx.amount.toString(),
      direction: tx.direction,
      description: tx.description,
      refId: tx.refId,
      refType: tx.refType,
      runningBalance: running.toString(),
    });
  }

  return {
    customer,
    transactions,
  };
}
