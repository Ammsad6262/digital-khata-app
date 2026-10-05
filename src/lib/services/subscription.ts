/**
 * Subscription service — trial creation, status checks, code redemption,
 * and admin code generation.
 *
 * Security principles:
 *   - userId is ALWAYS derived server-side from the JWT session, NEVER from
 *     the request body.
 *   - Redeem codes are stored as SHA-256 hashes. Plaintext is shown ONLY
 *     once at generation time to the admin.
 *   - Code redemption is atomic (database transaction + row-level locking).
 *   - The server determines the duration — the frontend only submits the code.
 *   - Trial is granted exactly once per user (enforced by the unique
 *     constraint on UserSubscription.userId).
 */

import { prisma } from "@/lib/db/prisma";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { createHash, randomBytes } from "crypto";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const TRIAL_DURATION_DAYS = 30;

/** Characters used for code generation (no ambiguous chars like O/0, I/1, S/5). */
const CODE_CHARS = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_PREFIX = "DKH";
const CODE_SEGMENT_LENGTH = 4;
const CODE_SEGMENTS = 3;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

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
  /** The effective expiration — whichever is later between trial and access. */
  effectiveExpiresAt: Date | null;
  /** Remaining days (rounded down). Null if already expired. */
  remainingDays: number | null;
  /** Whether the user can redeem a code (always true if authenticated). */
  canRedeem: boolean;
};

export type RedeemResult = {
  success: true;
  durationDays: number;
  newAccessExpiresAt: Date;
  previousAccessExpiresAt: Date | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Hash a code using SHA-256. Returns hex string. */
function hashCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase().trim()).digest("hex");
}

/** Generate a cryptographically secure random code like DKH-7F3K-92LM. */
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

/** Calculate the effective expiration date from a subscription. */
function getEffectiveExpiry(sub: {
  trialExpiresAt: Date;
  accessExpiresAt: Date | null;
}): Date {
  if (sub.accessExpiresAt) {
    // Use whichever is later: trial expiry or access expiry
    return sub.accessExpiresAt > sub.trialExpiresAt
      ? sub.accessExpiresAt
      : sub.trialExpiresAt;
  }
  return sub.trialExpiresAt;
}

/** Calculate remaining days from an expiration date. Returns 0 if expired. */
function calcRemainingDays(expiresAt: Date): number {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ────────────────────────────────────────────────────────────────────────────
// Trial creation (called once at registration)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a 30-day trial subscription for a new user.
 * Called by the registration service after user creation.
 * Safe to call multiple times — uses upsert with userId as the unique key.
 */
export async function createTrial(userId: string): Promise<void> {
  const now = new Date();
  const trialExpires = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.userSubscription.upsert({
    where: { userId },
    create: {
      userId,
      status: "TRIAL_ACTIVE",
      trialStartedAt: now,
      trialExpiresAt: trialExpires,
    },
    update: {
      // Don't overwrite an existing subscription — the trial is granted once.
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Status query
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get the current user's subscription status.
 * If no subscription record exists, creates one with a fresh trial.
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionView> {
  let sub = await prisma.userSubscription.findUnique({ where: { userId } });

  if (!sub) {
    // No subscription record — create a trial (handles existing users who
    // were created before the subscription system existed).
    await createTrial(userId);
    sub = await prisma.userSubscription.findUniqueOrThrow({ where: { userId } });
  }

  const now = new Date();
  const effectiveExpiry = getEffectiveExpiry(sub);
  const isExpired = effectiveExpiry <= now;
  const remainingDays = calcRemainingDays(effectiveExpiry);

  // Determine status
  let status: SubscriptionStatus;
  const hasAccess = sub.accessExpiresAt && sub.accessExpiresAt > now;

  if (hasAccess) {
    status = "ACTIVE";
  } else if (sub.trialExpiresAt > now) {
    status = "TRIAL_ACTIVE";
  } else if (sub.accessExpiresAt && sub.accessExpiresAt <= now) {
    status = "EXPIRED";
  } else {
    status = "TRIAL_EXPIRED";
  }

  return {
    status,
    isTrial: status === "TRIAL_ACTIVE" || status === "TRIAL_EXPIRED",
    isActive: status === "TRIAL_ACTIVE" || status === "ACTIVE",
    isExpired: status === "TRIAL_EXPIRED" || status === "EXPIRED",
    trialStartedAt: sub.trialStartedAt,
    trialExpiresAt: sub.trialExpiresAt,
    accessStartedAt: sub.accessStartedAt,
    accessExpiresAt: sub.accessExpiresAt,
    effectiveExpiresAt: effectiveExpiry,
    remainingDays: isExpired ? 0 : remainingDays,
    canRedeem: true,
  };
}

/**
 * Check if a user has active access. Used by middleware/access control.
 * Returns true if the user has an active trial or subscription.
 */
export async function hasActiveAccess(userId: string): Promise<boolean> {
  const status = await getSubscriptionStatus(userId);
  return status.isActive;
}

// ────────────────────────────────────────────────────────────────────────────
// Code redemption
// ────────────────────────────────────────────────────────────────────────────

/**
 * Redeem an activation code for the authenticated user.
 *
 * Atomic operation using a database transaction:
 *   1. Look up the code by hash (with SELECT FOR UPDATE via updateMany).
 *   2. Validate: exists, active, not expired, redemption limit not reached.
 *   3. Calculate new access expiration:
 *      - If current access is still active: extend from current expiry.
 *      - If current access has expired: start from now.
 *   4. Increment redemption count.
 *   5. Create redemption history record.
 *   6. Update subscription record.
 *
 * The frontend NEVER sends a duration — the server determines it from the
 * code's database record.
 */
export async function redeemCode(userId: string, code: string): Promise<RedeemResult> {
  const normalizedCode = code.toUpperCase().trim();
  if (!normalizedCode) {
    throw new BadRequestError("Please enter an activation code.");
  }

  const codeHash = hashCode(normalizedCode);

  // Use a transaction for atomicity — prevents double-redemption from
  // concurrent requests.
  const result = await prisma.$transaction(async (tx) => {
    // 1. Find the code by hash
    const redeemCode = await tx.redeemCode.findUnique({
      where: { codeHash },
    });

    if (!redeemCode) {
      throw new BadRequestError("That code isn't valid. Please check the code and try again.");
    }

    // 2. Validate the code
    if (!redeemCode.active) {
      throw new BadRequestError("This code is no longer available.");
    }

    if (redeemCode.expiresAt && redeemCode.expiresAt <= new Date()) {
      throw new BadRequestError("This activation code has expired. Please contact us for a new code.");
    }

    if (redeemCode.maxRedemptions > 0 && redeemCode.redemptionCount >= redeemCode.maxRedemptions) {
      throw new BadRequestError("This code has already been fully redeemed.");
    }

    // 3. Get the user's current subscription
    let subscription = await tx.userSubscription.findUnique({ where: { userId } });
    if (!subscription) {
      // Create a trial if somehow missing (shouldn't happen due to backfill)
      const now = new Date();
      await tx.userSubscription.create({
        data: {
          userId,
          status: "TRIAL_ACTIVE",
          trialStartedAt: now,
          trialExpiresAt: new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      subscription = await tx.userSubscription.findUniqueOrThrow({ where: { userId } });
    }

    // 4. Calculate new access expiration
    const now = new Date();
    const currentEffectiveExpiry = getEffectiveExpiry(subscription);
    const isCurrentlyActive = currentEffectiveExpiry > now;

    // If currently active, extend from current expiry. Otherwise, start from now.
    const baseDate = isCurrentlyActive ? currentEffectiveExpiry : now;
    const newAccessExpiresAt = new Date(baseDate.getTime() + redeemCode.durationDays * 24 * 60 * 60 * 1000);

    const previousAccessExpiresAt = subscription.accessExpiresAt;

    // 5. Increment redemption count (atomic — uses a conditional update)
    const updateResult = await tx.redeemCode.updateMany({
      where: {
        id: redeemCode.id,
        // Only update if we haven't hit the limit (prevents race condition)
        ...(redeemCode.maxRedemptions > 0
          ? { redemptionCount: { lt: redeemCode.maxRedemptions } }
          : {}),
      },
      data: {
        redemptionCount: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      // Another request redeemed the last use between our find and update
      throw new BadRequestError("This code has already been fully redeemed.");
    }

    // 6. Create redemption history
    await tx.redeemCodeRedemption.create({
      data: {
        redeemCodeId: redeemCode.id,
        userId,
        durationDays: redeemCode.durationDays,
        previousAccessExpiresAt,
        newAccessExpiresAt,
      },
    });

    // 7. Update subscription
    await tx.userSubscription.update({
      where: { userId },
      data: {
        status: "ACTIVE",
        accessStartedAt: subscription.accessStartedAt ?? now,
        accessExpiresAt: newAccessExpiresAt,
      },
    });

    return {
      success: true as const,
      durationDays: redeemCode.durationDays,
      newAccessExpiresAt,
      previousAccessExpiresAt,
    };
  });

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Redemption history
// ────────────────────────────────────────────────────────────────────────────

export type RedemptionHistoryEntry = {
  id: string;
  durationDays: number;
  previousAccessExpiresAt: Date | null;
  newAccessExpiresAt: Date;
  redeemedAt: Date;
};

export async function getRedemptionHistory(userId: string): Promise<RedemptionHistoryEntry[]> {
  const redemptions = await prisma.redeemCodeRedemption.findMany({
    where: { userId },
    orderBy: { redeemedAt: "desc" },
    select: {
      id: true,
      durationDays: true,
      previousAccessExpiresAt: true,
      newAccessExpiresAt: true,
      redeemedAt: true,
    },
  });

  return redemptions;
}

// ────────────────────────────────────────────────────────────────────────────
// Admin: code generation (protected by ADMIN_SECRET env var)
// ────────────────────────────────────────────────────────────────────────────

export type GeneratedCode = {
  code: string;     // plaintext — shown only once
  durationDays: number;
  maxRedemptions: number;
  expiresAt: Date | null;
};

export type AdminCodeInput = {
  durationDays: number;
  maxRedemptions?: number;
  expiresAt?: Date | null;
  count?: number;  // how many codes to generate (default 1, max 100)
};

/**
 * Generate one or more redeem codes. Only callable by the admin
 * (the API route verifies ADMIN_SECRET before calling this).
 */
export async function generateCodes(input: AdminCodeInput): Promise<GeneratedCode[]> {
  const { durationDays, maxRedemptions = 1, expiresAt = null, count = 1 } = input;

  if (durationDays <= 0 || durationDays > 3650) {
    throw new BadRequestError("Duration must be between 1 and 3650 days.");
  }

  const numCodes = Math.min(Math.max(count, 1), 100);
  const results: GeneratedCode[] = [];

  for (let i = 0; i < numCodes; i++) {
    const code = generateCode();
    const codeHash = hashCode(code);

    await prisma.redeemCode.create({
      data: {
        codeHash,
        durationDays,
        maxRedemptions,
        expiresAt,
        createdBy: "admin",
      },
    });

    results.push({
      code,
      durationDays,
      maxRedemptions,
      expiresAt,
    });
  }

  return results;
}

/**
 * List all redeem codes (admin only — never exposed to normal users).
 */
export async function listCodesAdmin() {
  const codes = await prisma.redeemCode.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      durationDays: true,
      maxRedemptions: true,
      redemptionCount: true,
      active: true,
      expiresAt: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      // NOTE: codeHash is NOT returned — it's a hash, not the plaintext.
      // The plaintext code is only available at generation time.
      _count: { select: { redemptions: true } },
    },
  });

  return codes;
}

/**
 * Disable a redeem code (admin only).
 */
export async function disableCode(codeId: string): Promise<void> {
  await prisma.redeemCode.update({
    where: { id: codeId },
    data: { active: false },
  });
}

/**
 * Enable a redeem code (admin only).
 */
export async function enableCode(codeId: string): Promise<void> {
  await prisma.redeemCode.update({
    where: { id: codeId },
    data: { active: true },
  });
}
