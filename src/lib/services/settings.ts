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
