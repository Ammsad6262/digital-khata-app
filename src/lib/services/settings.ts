/**
 * Settings service layer.
 *
 * The Setting table is a singleton — only one row, id = "singleton".
 * This service lazily creates the row if it doesn't exist yet.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export type SettingView = {
  businessName: string | null;
  currency: string;
  currencySymbol: string;
  timezone: string;
  hasPin: boolean;
};

const SINGLETON_ID = "singleton";

function toView(s: Prisma.SettingGetPayload<{}>): SettingView {
  return {
    businessName: s.businessName,
    currency: s.currency,
    currencySymbol: s.currencySymbol,
    timezone: s.timezone,
    hasPin: s.ownerPinHash !== null && s.ownerPinHash !== "",
  };
}

/** Get the current settings. Lazily creates the singleton row if missing. */
export async function getSettings(): Promise<SettingView> {
  const setting = await prisma.setting.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
  return toView(setting);
}

/** Get the raw owner PIN hash (for auth). Returns null if no PIN is set. */
export async function getOwnerPinHash(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { id: SINGLETON_ID } });
  if (!setting) return null;
  return setting.ownerPinHash && setting.ownerPinHash.length > 0
    ? setting.ownerPinHash
    : null;
}

/** Set the owner PIN hash (called by the auth flow after bcrypt hashing). */
export async function setOwnerPinHash(hash: string): Promise<void> {
  await prisma.setting.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ownerPinHash: hash },
    update: { ownerPinHash: hash },
  });
}

/** Remove the owner PIN (disables PIN lock). */
export async function clearOwnerPinHash(): Promise<void> {
  await prisma.setting.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ownerPinHash: null },
    update: { ownerPinHash: null },
  });
}

/**
 * Clear ALL business data (the "danger zone" action).
 * Keeps the Setting row (with business name + currency) but wipes everything else.
 * Used by Settings → Data Management → Clear All Data.
 *
 * IMPORTANT: This is destructive. The API route requires explicit confirmation.
 */
export async function clearAllData(): Promise<{
  deleted: {
    transactions: number;
    saleItems: number;
    payments: number;
    sales: number;
    stockMoves: number;
    expenses: number;
    customerAdjustments: number;
    customers: number;
    products: number;
  };
}> {
  // Wrap in a transaction — if any delete fails (e.g. FK constraint),
  // the entire operation rolls back. No partial state.
  const result = await prisma.$transaction(async (tx) => {
    const transactions = await tx.transaction.deleteMany({});
    const saleItems = await tx.saleItem.deleteMany({});
    const payments = await tx.payment.deleteMany({});
    const sales = await tx.sale.deleteMany({});
    const stockMoves = await tx.stockMove.deleteMany({});
    const expenses = await tx.expense.deleteMany({});
    const customerAdjustments = await tx.customerAdjustment.deleteMany({});
    const customers = await tx.customer.deleteMany({});
    const products = await tx.product.deleteMany({});

    return {
      transactions: transactions.count,
      saleItems: saleItems.count,
      payments: payments.count,
      sales: sales.count,
      stockMoves: stockMoves.count,
      expenses: expenses.count,
      customerAdjustments: customerAdjustments.count,
      customers: customers.count,
      products: products.count,
    };
  });

  return { deleted: result };
}

/** Update business name / currency / etc. */
export async function updateSettings(input: {
  businessName?: string | null;
  currency?: string;
  currencySymbol?: string;
  timezone?: string;
}): Promise<SettingView> {
  const updated = await prisma.setting.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      businessName: input.businessName ?? null,
      currency: input.currency ?? "PKR",
      currencySymbol: input.currencySymbol ?? "Rs.",
      timezone: input.timezone ?? "Asia/Karachi",
    },
    update: {
      ...(input.businessName !== undefined && { businessName: input.businessName }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.currencySymbol !== undefined && { currencySymbol: input.currencySymbol }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
    },
  });
  return toView(updated);
}
