/**
 * Settings service layer — per-user settings.
 *
 * Each user has exactly one Setting row (one-to-one via userId @unique).
 * The service lazily creates the row if it doesn't exist.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export type SettingView = {
  businessName: string | null;
  currency: string;
  currencySymbol: string;
  timezone: string;
  hasPin: boolean;
  customUnits: string[];
  theme: string;
};

function toView(s: Prisma.SettingGetPayload<{}>): SettingView {
  return {
    businessName: s.businessName,
    currency: s.currency,
    currencySymbol: s.currencySymbol,
    timezone: s.timezone,
    hasPin: s.ownerPinHash !== null && s.ownerPinHash !== "",
    customUnits: s.customUnits ?? [],
    theme: s.theme ?? "monochrome",
  };
}

/** Get the current user's settings. Lazily creates the row if missing. */
export async function getSettings(userId: string): Promise<SettingView> {
  const setting = await prisma.setting.findUnique({ where: { userId } });
  if (!setting) {
    const created = await prisma.setting.create({ data: { userId } });
    return toView(created);
  }
  return toView(setting);
}

/** Get the raw owner PIN hash (for auth). Returns null if no PIN is set. */
export async function getOwnerPinHash(userId: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { userId } });
  if (!setting) return null;
  return setting.ownerPinHash && setting.ownerPinHash.length > 0
    ? setting.ownerPinHash
    : null;
}

/** Set the owner PIN hash (called by the auth flow after bcrypt hashing). */
export async function setOwnerPinHash(userId: string, hash: string): Promise<void> {
  await prisma.setting.upsert({
    where: { userId },
    create: { userId, ownerPinHash: hash },
    update: { ownerPinHash: hash },
  });
}

/** Remove the owner PIN (disables PIN lock). */
export async function clearOwnerPinHash(userId: string): Promise<void> {
  await prisma.setting.upsert({
    where: { userId },
    create: { userId, ownerPinHash: null },
    update: { ownerPinHash: null },
  });
}

/**
 * Clear ALL business data belonging to the authenticated user ONLY.
 * Keeps the Setting row (with business name + currency + PIN).
 */
export async function clearAllData(userId: string): Promise<{
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
  const result = await prisma.$transaction(async (tx) => {
    const transactions = await tx.transaction.deleteMany({ where: { userId } });
    const saleItems = await tx.saleItem.deleteMany({ where: { sale: { userId } } });
    const payments = await tx.payment.deleteMany({ where: { userId } });
    const sales = await tx.sale.deleteMany({ where: { userId } });
    const stockMoves = await tx.stockMove.deleteMany({ where: { userId } });
    const expenses = await tx.expense.deleteMany({ where: { userId } });
    const customerAdjustments = await tx.customerAdjustment.deleteMany({ where: { userId } });
    const customers = await tx.customer.deleteMany({ where: { userId } });
    const products = await tx.product.deleteMany({ where: { userId } });

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

/** Update business name / currency / etc for the authenticated user. */
export async function updateSettings(
  userId: string,
  input: {
    businessName?: string | null;
    currency?: string;
    currencySymbol?: string;
    timezone?: string;
    customUnits?: string[];
    theme?: string;
  },
): Promise<SettingView> {
  const updated = await prisma.setting.upsert({
    where: { userId },
    create: {
      userId,
      businessName: input.businessName ?? null,
      currency: input.currency ?? "PKR",
      currencySymbol: input.currencySymbol ?? "Rs.",
      timezone: input.timezone ?? "Asia/Karachi",
      customUnits: input.customUnits ?? [],
      theme: input.theme ?? "monochrome",
    },
    update: {
      ...(input.businessName !== undefined && { businessName: input.businessName }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.currencySymbol !== undefined && { currencySymbol: input.currencySymbol }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.customUnits !== undefined && { customUnits: input.customUnits }),
      ...(input.theme !== undefined && { theme: input.theme }),
    },
  });
  return toView(updated);
}
