/**
 * Subscription service — trial creation, status checks, code redemption,
 * and admin code generation.
 */

import { prisma } from "@/lib/db/prisma";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { createHash, randomBytes } from "crypto";

const TRIAL_DURATION_DAYS = 30;
const CODE_CHARS = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_PREFIX = "DKH";
const CODE_SEGMENT_LENGTH = 4;
const CODE_SEGMENTS = 3;

export type SubscriptionStatus = "TRIAL_ACTIVE" | "TRIAL_EXPIRED" | "ACTIVE" | "EXPIRED";

export type SubscriptionView = {
  status: SubscriptionStatus;
  isTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  trialStartedAt: Date | null;
  trialExpiresAt: Date | null;
  accessStartedAt: Date | null;
  accessExpiresAt: Date | null;
  effectiveExpiresAt: Date | null;
  remainingDays: number | null;
  canRedeem: boolean;
};

export type RedeemResult = {
  success: true;
  durationDays: number;
  newAccessExpiresAt: Date;
  previousAccessExpiresAt: Date | null;
};

export type RedemptionHistoryEntry = {
  id: string;
  durationDays: number;
  previousAccessExpiresAt: Date | null;
  newAccessExpiresAt: Date;
  redeemedAt: Date;
};

function hashCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase().trim()).digest("hex");
}

function generateCode(): string {
  const segments: string[] = [];
  for (let s = 0; s < CODE_SEGMENTS; s++) {
    let segment = "";
    const bytes = randomBytes(CODE_SEGMENT_LENGTH);
    for (let i = 0; i < CODE_SEGMENT_LENGTH; i++) {
      segment += CODE_CHARS[bytes[i]! % CODE_CHARS.length];
    }
    segments.push(segment);
  }
  return `${CODE_PREFIX}-${segments.join("-")}`;
}

function getEffectiveExpiry(sub: { trialExpiresAt: Date; accessExpiresAt: Date | null }): Date {
  if (sub.accessExpiresAt) {
    return sub.accessExpiresAt > sub.trialExpiresAt ? sub.accessExpiresAt : sub.trialExpiresAt;
  }
  return sub.trialExpiresAt;
}

function calcRemainingDays(expiresAt: Date): number {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function createTrial(userId: string): Promise<void> {
  const now = new Date();
  const trialExpires = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.userSubscription.upsert({
    where: { userId },
    create: { userId, status: "TRIAL_ACTIVE", trialStartedAt: now, trialExpiresAt: trialExpires },
    update: {},
  });
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionView> {
  let sub = await prisma.userSubscription.findUnique({ where: { userId } });
  if (!sub) {
    await createTrial(userId);
    sub = await prisma.userSubscription.findUniqueOrThrow({ where: { userId } });
  }

  const now = new Date();
  const effectiveExpiry = getEffectiveExpiry(sub);
  const isExpired = effectiveExpiry <= now;
  const remainingDays = calcRemainingDays(effectiveExpiry);
  const hasAccess = sub.accessExpiresAt && sub.accessExpiresAt > now;

  let status: SubscriptionStatus;
  if (hasAccess) status = "ACTIVE";
  else if (sub.trialExpiresAt > now) status = "TRIAL_ACTIVE";
  else if (sub.accessExpiresAt && sub.accessExpiresAt <= now) status = "EXPIRED";
  else status = "TRIAL_EXPIRED";

  return {
    status, isTrial: status === "TRIAL_ACTIVE" || status === "TRIAL_EXPIRED",
    isActive: status === "TRIAL_ACTIVE" || status === "ACTIVE",
    isExpired: status === "TRIAL_EXPIRED" || status === "EXPIRED",
    trialStartedAt: sub.trialStartedAt, trialExpiresAt: sub.trialExpiresAt,
    accessStartedAt: sub.accessStartedAt, accessExpiresAt: sub.accessExpiresAt,
    effectiveExpiresAt: effectiveExpiry,
    remainingDays: isExpired ? 0 : remainingDays, canRedeem: true,
  };
}

export async function hasActiveAccess(userId: string): Promise<boolean> {
  const status = await getSubscriptionStatus(userId);
  return status.isActive;
}

export async function redeemCode(userId: string, code: string): Promise<RedeemResult> {
  const normalizedCode = code.toUpperCase().trim();
  if (!normalizedCode) throw new BadRequestError("Please enter an activation code.");
  const codeHash = hashCode(normalizedCode);

  const result = await prisma.$transaction(async (tx) => {
    const redeemCode = await tx.redeemCode.findUnique({ where: { codeHash } });
    if (!redeemCode) throw new BadRequestError("That code isn't valid. Please check the code and try again.");
    if (!redeemCode.active) throw new BadRequestError("This code is no longer available.");
    if (redeemCode.expiresAt && redeemCode.expiresAt <= new Date()) throw new BadRequestError("This activation code has expired. Please contact us for a new code.");
    if (redeemCode.maxRedemptions > 0 && redeemCode.redemptionCount >= redeemCode.maxRedemptions) throw new BadRequestError("This code has already been fully redeemed.");

    let subscription = await tx.userSubscription.findUnique({ where: { userId } });
    if (!subscription) {
      const now = new Date();
      await tx.userSubscription.create({ data: { userId, status: "TRIAL_ACTIVE", trialStartedAt: now, trialExpiresAt: new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000) } });
      subscription = await tx.userSubscription.findUniqueOrThrow({ where: { userId } });
    }

    const now = new Date();
    const currentEffectiveExpiry = getEffectiveExpiry(subscription);
    const isCurrentlyActive = currentEffectiveExpiry > now;
    const baseDate = isCurrentlyActive ? currentEffectiveExpiry : now;
    const newAccessExpiresAt = new Date(baseDate.getTime() + redeemCode.durationDays * 24 * 60 * 60 * 1000);
    const previousAccessExpiresAt = subscription.accessExpiresAt;

    const updateResult = await tx.redeemCode.updateMany({
      where: { id: redeemCode.id, ...(redeemCode.maxRedemptions > 0 ? { redemptionCount: { lt: redeemCode.maxRedemptions } } : {}) },
      data: { redemptionCount: { increment: 1 } },
    });
    if (updateResult.count === 0) throw new BadRequestError("This code has already been fully redeemed.");

    await tx.redeemCodeRedemption.create({ data: { redeemCodeId: redeemCode.id, userId, durationDays: redeemCode.durationDays, previousAccessExpiresAt, newAccessExpiresAt } });
    await tx.userSubscription.update({ where: { userId }, data: { status: "ACTIVE", accessStartedAt: subscription.accessStartedAt ?? now, accessExpiresAt: newAccessExpiresAt } });

    return { success: true as const, durationDays: redeemCode.durationDays, newAccessExpiresAt, previousAccessExpiresAt };
  });
  return result;
}

export async function getRedemptionHistory(userId: string): Promise<RedemptionHistoryEntry[]> {
  const redemptions = await prisma.redeemCodeRedemption.findMany({
    where: { userId }, orderBy: { redeemedAt: "desc" },
    select: { id: true, durationDays: true, previousAccessExpiresAt: true, newAccessExpiresAt: true, redeemedAt: true },
  });
  return redemptions;
}

export type GeneratedCode = { code: string; durationDays: number; maxRedemptions: number; expiresAt: Date | null; };
export type AdminCodeInput = { durationDays: number; maxRedemptions?: number; expiresAt?: Date | null; count?: number; };

export async function generateCodes(input: AdminCodeInput): Promise<GeneratedCode[]> {
  const { durationDays, maxRedemptions = 1, expiresAt = null, count = 1 } = input;
  if (durationDays <= 0 || durationDays > 3650) throw new BadRequestError("Duration must be between 1 and 3650 days.");
  const numCodes = Math.min(Math.max(count, 1), 100);
  const results: GeneratedCode[] = [];
  for (let i = 0; i < numCodes; i++) {
    const code = generateCode();
    const codeHash = hashCode(code);
    await prisma.redeemCode.create({ data: { codeHash, durationDays, maxRedemptions, expiresAt, createdBy: "admin" } });
    results.push({ code, durationDays, maxRedemptions, expiresAt });
  }
  return results;
}

export async function listCodesAdmin() {
  return prisma.redeemCode.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, durationDays: true, maxRedemptions: true, redemptionCount: true, active: true, expiresAt: true, createdBy: true, createdAt: true, updatedAt: true, _count: { select: { redemptions: true } } },
  });
}

export async function disableCode(codeId: string): Promise<void> {
  await prisma.redeemCode.update({ where: { id: codeId }, data: { active: false } });
}

export async function enableCode(codeId: string): Promise<void> {
  await prisma.redeemCode.update({ where: { id: codeId }, data: { active: true } });
}
