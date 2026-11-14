/**
 * Subscription service — trial creation, status checks, code redemption,
 * and admin code generation.
 */

import { prisma, withUserRls } from "@/lib/db/prisma";
import { createHash, randomBytes } from "crypto";
import {
  PREMIUM_PERIOD_DAYS,
  computeEntitlement,
  hasCoreAccess,
  redeemLicenseCode,
  trialExpiry,
  type Entitlement,
} from "@/lib/services/entitlement";

const CODE_CHARS = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_PREFIX = "DKH";
const CODE_SEGMENT_LENGTH = 4;
const CODE_SEGMENTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Billing is opt-in. Until a real payment provider is connected, this stays
 * false and every feature (including AI) remains available. Set
 * BILLING_ENABLED=true only after the provider is configured and tested.
 */
export const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

/**
 * Commercial licensing enforcement. On by default: a user needs an active core
 * licence (a live free trial, a product code, or an owner/affiliate grant) to
 * use the business app. When the trial ends — or a paid account signs up
 * without a code — the app locks and asks for a redeem code. Set
 * LICENSING_ENFORCED=false only to restore the legacy unrestricted behaviour.
 * The entitlement service (`lib/services/entitlement.ts`) remains the single
 * source of truth for access.
 */
export const LICENSING_ENFORCED = process.env.LICENSING_ENFORCED !== "false";

export type SubscriptionStatus =
  | "TRIAL_ACTIVE"
  | "TRIAL_EXPIRED"
  | "ACTIVE"
  | "EXPIRED"
  | "BILLING_DISABLED";

export type SubscriptionView = {
  status: SubscriptionStatus;
  billingEnabled: boolean;
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
  /** True when business APIs require an activated core licence. */
  licensingEnforced: boolean;
  /** Authoritative commercial entitlement (category-based licensing). */
  licensing: Entitlement;
};

export type RedeemResult = {
  success: true;
  durationDays: number;
  newAccessExpiresAt: Date;
  previousAccessExpiresAt: Date | null;
};

export type RedemptionHistoryEntry = {
  id: string;
  kind: string;
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

export async function createTrial(userId: string): Promise<void> {
  const now = new Date();
  const trialExpires = trialExpiry(now);
  await prisma.userSubscription.upsert({
    where: { userId },
    create: {
      userId,
      status: "TRIAL_ACTIVE",
      trialStartedAt: now,
      trialExpiresAt: trialExpires,
      // Preserve the free trial as a core-only trial.
      coreActivatedAt: now,
      coreExpiresAt: trialExpires,
    },
    update: {},
  });
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionView> {
  let sub = await withUserRls(userId, (tx) =>
    tx.userSubscription.findUnique({ where: { userId } }),
  );
  if (!sub) {
    await createTrial(userId);
    sub = await withUserRls(userId, (tx) =>
      tx.userSubscription.findUniqueOrThrow({ where: { userId } }),
    );
  }

  const now = new Date();
  const licensing = computeEntitlement(userId, sub);

  // Commercial licensing is the single source of truth for access. When it is
  // enforced (the default), an account needs an active core licence: a live
  // trial, a permanent product code, or an owner/affiliate grant. An expired
  // trial and a paid signup that has not redeemed a code are both locked and
  // are sent to the redeem screen.
  const legacyExpiry = getEffectiveExpiry(sub);
  const legacyExpired = legacyExpiry <= now;
  const isExpired = LICENSING_ENFORCED
    ? !licensing.core.active
    : BILLING_ENABLED
      ? legacyExpired
      : false;

  const effectiveExpiresAt = licensing.core.trial
    ? licensing.core.expiresAt
    : licensing.premium.active && licensing.premium.expiresAt
      ? licensing.premium.expiresAt
      : null;
  const remainingDays = effectiveExpiresAt
    ? Math.max(
        0,
        Math.ceil((effectiveExpiresAt.getTime() - now.getTime()) / DAY_MS),
      )
    : null;

  let status: SubscriptionStatus;
  if (LICENSING_ENFORCED) {
    if (!licensing.core.active) status = "TRIAL_EXPIRED";
    else if (licensing.category === "TRIAL") status = "TRIAL_ACTIVE";
    else status = "ACTIVE";
  } else if (!BILLING_ENABLED) {
    status = "BILLING_DISABLED";
  } else {
    const hasAccess = Boolean(sub.accessExpiresAt && sub.accessExpiresAt > now);
    if (hasAccess) status = "ACTIVE";
    else if (sub.trialExpiresAt > now) status = "TRIAL_ACTIVE";
    else if (sub.accessExpiresAt && sub.accessExpiresAt <= now) status = "EXPIRED";
    else status = "TRIAL_EXPIRED";
  }

  const isTrial = LICENSING_ENFORCED
    ? licensing.category === "TRIAL"
    : status === "TRIAL_ACTIVE" || status === "TRIAL_EXPIRED";

  return {
    status,
    billingEnabled: BILLING_ENABLED,
    isTrial,
    isActive: !isExpired,
    isExpired,
    trialStartedAt: sub.trialStartedAt,
    trialExpiresAt: sub.trialExpiresAt,
    accessStartedAt: sub.accessStartedAt,
    accessExpiresAt: sub.accessExpiresAt,
    effectiveExpiresAt,
    remainingDays: isExpired ? 0 : remainingDays,
    canRedeem: true,
    licensingEnforced: LICENSING_ENFORCED,
    licensing,
  };
}

export async function hasActiveAccess(userId: string): Promise<boolean> {
  // Commercial licensing enforcement takes precedence when enabled: core
  // access comes from the entitlement service (the single source of truth).
  if (LICENSING_ENFORCED) return hasCoreAccess(userId);
  // Otherwise preserve the pre-licensing behaviour exactly: with billing off
  // every feature stays open; with billing on the legacy trial/access expiry
  // still gates the app.
  if (!BILLING_ENABLED) return true;
  return (await getSubscriptionStatus(userId)).isActive;
}

export async function redeemCode(userId: string, code: string): Promise<RedeemResult> {
  // Delegate to the category-aware entitlement service so there is exactly one
  // redemption path. Legacy duration-based codes are treated as PREMIUM codes.
  return redeemLicenseCode(userId, code);
}

export async function getRedemptionHistory(userId: string): Promise<RedemptionHistoryEntry[]> {
  const redemptions = await withUserRls(userId, (tx) =>
    tx.redeemCodeRedemption.findMany({
      where: { userId }, orderBy: { redeemedAt: "desc" },
      select: { id: true, kind: true, durationDays: true, previousAccessExpiresAt: true, newAccessExpiresAt: true, redeemedAt: true },
    }),
  );
  return redemptions;
}

export type GeneratedCode = { code: string; durationDays: number; maxRedemptions: number; expiresAt: Date | null; };
export type AdminCodeInput = { durationDays: number; maxRedemptions?: number; expiresAt?: Date | null; count?: number; };

export async function generateCodes(input: AdminCodeInput): Promise<GeneratedCode[]> {
  const { maxRedemptions = 1, expiresAt = null, count = 1 } = input;
  // Commercial rule: a premium code is always a 30-day period. The legacy
  // /admin/codes page must not mint arbitrary-duration codes that bypass the
  // licensing business rule.
  const durationDays = PREMIUM_PERIOD_DAYS;
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
