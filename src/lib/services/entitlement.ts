/**
 * Commercial entitlement service — the SINGLE source of truth for commercial
 * access. Every access decision (core product access, premium/AI entitlement,
 * owner/affiliate status) is derived from one `UserSubscription` row.
 *
 * Customer categories
 * -------------------
 *   UNACTIVATED  no product code redeemed, not owner/affiliate
 *   REGULAR      permanent core access, no premium
 *   PREMIUM      permanent core access, premium until `premiumExpiresAt`
 *   AFFILIATE    permanent core + permanent premium (max 10 codes)
 *   OWNER        permanent core + permanent premium (max 2 accounts)
 *
 * Expiry is always evaluated on the server against the current time. Nothing
 * here trusts a client, a cookie, or a cached frontend value. A premium
 * customer whose `premiumExpiresAt` has passed is REGULAR again immediately,
 * even if an old browser session is still open.
 *
 * The AI workstream can consume `hasPremiumAccess(userId)` /
 * `getEntitlement(userId)` — see docs/COMMERCIAL_LICENSING.md.
 */

import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma, withUserRls } from "@/lib/db/prisma";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit";

export const LICENSE_KINDS = ["PRODUCT", "PREMIUM", "AFFILIATE"] as const;
export type LicenseKind = (typeof LICENSE_KINDS)[number];

export const PREMIUM_PERIOD_DAYS = 30;
export const MAX_AFFILIATE_CODES = 10;
export const MAX_OWNERS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_SEGMENT_LENGTH = 4;
const CODE_SEGMENTS = 3;
const KIND_PREFIX: Record<LicenseKind, string> = {
  PRODUCT: "P",
  PREMIUM: "M",
  AFFILIATE: "A",
};

const AFFILIATE_LOCK_KEY = 918273645; // pg advisory lock for the 10-code cap
const OWNER_LOCK_KEY = 918273646; // pg advisory lock for the 2-owner cap

export type AccessCategory =
  | "UNACTIVATED"
  | "TRIAL"
  | "REGULAR"
  | "PREMIUM"
  | "AFFILIATE"
  | "OWNER";

export type Entitlement = {
  userId: string;
  category: AccessCategory;
  core: {
    active: boolean;
    /** A trial core has an expiry; a paid core is permanent. */
    trial: boolean;
    activatedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
  };
  premium: {
    active: boolean;
    /** True for owners/affiliates — never expires. */
    permanent: boolean;
    startedAt: Date | null;
    expiresAt: Date | null;
    remainingDays: number | null;
    revokedAt: Date | null;
  };
  isOwner: boolean;
  isAffiliate: boolean;
  accessRevoked: boolean;
  accessRevokedReason: string | null;
};

/** The subset of UserSubscription the entitlement calculation reads. */
export type SubscriptionSnapshot = {
  coreActivatedAt: Date | null;
  coreExpiresAt: Date | null;
  coreRevokedAt: Date | null;
  premiumStartedAt: Date | null;
  premiumExpiresAt: Date | null;
  premiumRevokedAt: Date | null;
  affiliateGrantedAt: Date | null;
  affiliateRevokedAt: Date | null;
  ownerGrantedAt: Date | null;
  ownerRevokedAt: Date | null;
  accessRevokedAt: Date | null;
  accessRevokedReason: string | null;
} | null;

export const SUBSCRIPTION_SNAPSHOT_SELECT = {
  coreActivatedAt: true,
  coreExpiresAt: true,
  coreRevokedAt: true,
  premiumStartedAt: true,
  premiumExpiresAt: true,
  premiumRevokedAt: true,
  affiliateGrantedAt: true,
  affiliateRevokedAt: true,
  ownerGrantedAt: true,
  ownerRevokedAt: true,
  accessRevokedAt: true,
  accessRevokedReason: true,
} as const;

function normalizeKind(kind: string): LicenseKind {
  return (LICENSE_KINDS as readonly string[]).includes(kind)
    ? (kind as LicenseKind)
    : "PREMIUM";
}

function hashCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase().trim()).digest("hex");
}

function generateCode(kind: LicenseKind): string {
  const segments: string[] = [];
  for (let s = 0; s < CODE_SEGMENTS; s++) {
    let segment = "";
    const bytes = randomBytes(CODE_SEGMENT_LENGTH);
    for (let i = 0; i < CODE_SEGMENT_LENGTH; i++) {
      segment += CODE_CHARS[bytes[i]! % CODE_CHARS.length];
    }
    segments.push(segment);
  }
  return `DKH-${KIND_PREFIX[kind]}-${segments.join("-")}`;
}

/**
 * Pure calculation: turn a subscription row into an entitlement. No I/O, so it
 * is safe to call from tests and from the admin listing for many users.
 */
export function computeEntitlement(
  userId: string,
  sub: SubscriptionSnapshot,
  now: Date = new Date(),
): Entitlement {
  const accessRevoked = Boolean(sub?.accessRevokedAt);

  // Owners and affiliates are permanent — but a global access revocation still
  // disables them until an admin explicitly restores access. This is what the
  // "revoke access" action is for.
  const isOwner = Boolean(
    sub?.ownerGrantedAt && !sub.ownerRevokedAt && !accessRevoked,
  );
  const isAffiliate = Boolean(
    sub?.affiliateGrantedAt && !sub.affiliateRevokedAt && !accessRevoked,
  );

  const coreActivated = Boolean(sub?.coreActivatedAt && !sub.coreRevokedAt);
  const coreExpiresAt = sub?.coreExpiresAt ?? null;
  const coreTimeValid =
    coreExpiresAt === null || coreExpiresAt.getTime() > now.getTime();
  const coreActive =
    !accessRevoked &&
    (isOwner || isAffiliate || (coreActivated && coreTimeValid));

  // A core with an expiry is the legacy 30-day trial, not a paid product.
  // Owners and affiliates are always permanent.
  const coreIsTrial = Boolean(
    !isOwner && !isAffiliate && coreExpiresAt !== null,
  );
  const trialActive = coreActive && coreIsTrial;

  const premiumPermanent = isOwner || isAffiliate;
  const premiumTimeValid = Boolean(
    sub?.premiumExpiresAt &&
      sub.premiumExpiresAt.getTime() > now.getTime() &&
      !sub.premiumRevokedAt &&
      !accessRevoked,
  );
  // Premium requires a paid core, not a trial core.
  const premiumActive =
    (premiumPermanent || premiumTimeValid) && coreActive && !coreIsTrial;

  let category: AccessCategory = "UNACTIVATED";
  if (isOwner) category = "OWNER";
  else if (isAffiliate) category = "AFFILIATE";
  else if (premiumActive) category = "PREMIUM";
  else if (trialActive) category = "TRIAL";
  else if (coreActive) category = "REGULAR";

  const remainingDays =
    premiumActive && !premiumPermanent && sub?.premiumExpiresAt
      ? Math.max(
          0,
          Math.ceil(
            (sub.premiumExpiresAt.getTime() - now.getTime()) / DAY_MS,
          ),
        )
      : null;

  return {
    userId,
    category,
    core: {
      active: coreActive,
      trial: coreIsTrial,
      activatedAt: sub?.coreActivatedAt ?? null,
      expiresAt: coreExpiresAt,
      revokedAt: sub?.coreRevokedAt ?? null,
    },
    premium: {
      active: premiumActive,
      permanent: premiumPermanent,
      startedAt: sub?.premiumStartedAt ?? null,
      expiresAt: premiumPermanent ? null : (sub?.premiumExpiresAt ?? null),
      remainingDays,
      revokedAt: sub?.premiumRevokedAt ?? null,
    },
    isOwner,
    isAffiliate,
    accessRevoked,
    accessRevokedReason: sub?.accessRevokedReason ?? null,
  };
}

/** Read the authoritative entitlement for one authenticated user. */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const sub = await withUserRls(userId, (tx) =>
    tx.userSubscription.findUnique({
      where: { userId },
      select: SUBSCRIPTION_SNAPSHOT_SELECT,
    }),
  );
  return computeEntitlement(userId, sub);
}

/** Does this user have active core product access? */
export async function hasCoreAccess(userId: string): Promise<boolean> {
  return (await getEntitlement(userId)).core.active;
}

/**
 * Does this user have active premium (AI) entitlement right now? This is the
 * function the AI workstream should call before serving a premium AI feature.
 */
export async function hasPremiumAccess(userId: string): Promise<boolean> {
  return (await getEntitlement(userId)).premium.active;
}

/** Ensure the user has a subscription row; returns the full row. */
async function ensureSubscriptionRow(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
) {
  const existing = await tx.userSubscription.findUnique({ where: { userId } });
  if (existing) return existing;
  const trialExpiresAt = new Date(
    now.getTime() + PREMIUM_PERIOD_DAYS * DAY_MS,
  );
  return tx.userSubscription.create({
    data: {
      userId,
      status: "TRIAL_ACTIVE",
      trialStartedAt: now,
      trialExpiresAt,
      coreActivatedAt: now,
      coreExpiresAt: trialExpiresAt,
    },
  });
}

export type LicenseRedeemResult = {
  success: true;
  kind: LicenseKind;
  durationDays: number;
  previousAccessExpiresAt: Date | null;
  newAccessExpiresAt: Date;
  category: AccessCategory;
  coreActive: boolean;
  premiumActive: boolean;
  premiumExpiresAt: Date | null;
};

/**
 * Redeem a product, premium, or affiliate code atomically.
 *
 * Concurrency: the `redemptionCount` increment is guarded by a conditional
 * `updateMany` (`redemptionCount < maxRedemptions`). Two simultaneous requests
 * cannot both increment a one-time code — the second sees count 0 and fails.
 */
export async function redeemLicenseCode(
  userId: string,
  rawCode: string,
): Promise<LicenseRedeemResult> {
  const normalized = rawCode.toUpperCase().trim();
  if (!normalized) throw new BadRequestError("api.licensing.codeRequired");
  const codeHash = hashCode(normalized);

  return withUserRls(userId, async (tx) => {
    const code = await tx.redeemCode.findUnique({ where: { codeHash } });
    if (!code) throw new BadRequestError("api.licensing.codeInvalid");
    if (!code.active || code.revokedAt)
      throw new BadRequestError("api.licensing.codeInactive");
    if (code.expiresAt && code.expiresAt.getTime() <= Date.now())
      throw new BadRequestError("api.licensing.codeExpired");
    if (
      code.maxRedemptions > 0 &&
      code.redemptionCount >= code.maxRedemptions
    )
      throw new BadRequestError("api.licensing.codeUsed");

    const kind = normalizeKind(code.kind);
    const now = new Date();
    const sub = await ensureSubscriptionRow(tx, userId, now);
    const before = computeEntitlement(userId, sub, now);

    let previousAccessExpiresAt: Date | null = null;
    let newAccessExpiresAt: Date;
    let durationDays = 0;
    let data: Prisma.UserSubscriptionUncheckedUpdateInput;

    if (kind === "PRODUCT") {
      // A trial user may upgrade to permanent core; an already-paid core
      // cannot be activated twice.
      if (before.core.active && !before.core.trial)
        throw new BadRequestError("api.licensing.alreadyActivated");
      newAccessExpiresAt = now;
      data = {
        coreActivatedAt: now,
        coreExpiresAt: null,
        coreRevokedAt: null,
      };
    } else if (kind === "PREMIUM") {
      if (before.isOwner || before.isAffiliate)
        throw new BadRequestError("api.licensing.alreadyPermanent");
      // Premium requires a paid product, not a trial core.
      if (!before.core.active || before.core.trial)
        throw new BadRequestError("api.licensing.productRequired");
      durationDays =
        code.durationDays > 0 ? code.durationDays : PREMIUM_PERIOD_DAYS;
      previousAccessExpiresAt = sub.premiumExpiresAt;
      const stillRunning =
        before.premium.active &&
        !before.premium.permanent &&
        sub.premiumExpiresAt !== null &&
        sub.premiumExpiresAt.getTime() > now.getTime();
      const base = stillRunning
        ? (sub.premiumExpiresAt as Date)
        : now;
      newAccessExpiresAt = new Date(
        base.getTime() + durationDays * DAY_MS,
      );
      data = {
        premiumStartedAt: sub.premiumStartedAt ?? now,
        premiumExpiresAt: newAccessExpiresAt,
        premiumRevokedAt: null,
      };
    } else {
      // AFFILIATE — permanent core + premium.
      if (before.isOwner)
        throw new BadRequestError("api.licensing.alreadyPermanent");
      if (before.isAffiliate)
        throw new BadRequestError("api.licensing.alreadyAffiliate");
      newAccessExpiresAt = now;
      data = {
        affiliateGrantedAt: now,
        affiliateRevokedAt: null,
        coreActivatedAt: now,
        coreExpiresAt: null,
        coreRevokedAt: null,
      };
    }

    const guard = await tx.redeemCode.updateMany({
      where: {
        id: code.id,
        active: true,
        ...(code.maxRedemptions > 0
          ? { redemptionCount: { lt: code.maxRedemptions } }
          : {}),
      },
      data: { redemptionCount: { increment: 1 } },
    });
    if (guard.count === 0)
      throw new BadRequestError("api.licensing.codeUsed");

    const updated = await tx.userSubscription.update({
      where: { userId },
      data,
    });

    await tx.redeemCodeRedemption.create({
      data: {
        redeemCodeId: code.id,
        userId,
        kind,
        durationDays,
        previousAccessExpiresAt:
          kind === "PREMIUM" ? previousAccessExpiresAt : null,
        newAccessExpiresAt,
      },
    });

    const after = computeEntitlement(userId, updated, now);
    return {
      success: true as const,
      kind,
      durationDays,
      previousAccessExpiresAt:
        kind === "PREMIUM" ? previousAccessExpiresAt : null,
      newAccessExpiresAt,
      category: after.category,
      coreActive: after.core.active,
      premiumActive: after.premium.active,
      premiumExpiresAt: after.premium.permanent
        ? null
        : after.premium.expiresAt,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Admin: code generation & lifecycle
// ────────────────────────────────────────────────────────────────────────────

export type GenerateLicenseInput = {
  kind: LicenseKind;
  count?: number;
  label?: string | null;
  expiresAt?: Date | null;
};

export type GeneratedLicenseCode = {
  code: string;
  kind: LicenseKind;
  durationDays: number;
  label: string | null;
  expiresAt: Date | null;
};

/**
 * Generate one or more codes. The plaintext code is returned exactly once
 * (here); only its SHA-256 hash is stored.
 */
export async function generateLicenseCodes(
  input: GenerateLicenseInput,
): Promise<GeneratedLicenseCode[]> {
  if (!(LICENSE_KINDS as readonly string[]).includes(input.kind))
    throw new BadRequestError("api.licensing.invalidKind");

  const kind = input.kind;
  const count = Math.min(Math.max(input.count ?? 1, 1), 100);
  const durationDays = kind === "PREMIUM" ? PREMIUM_PERIOD_DAYS : 0;
  const results: GeneratedLicenseCode[] = [];

  await prisma.$transaction(
    async (tx) => {
      if (kind === "AFFILIATE") {
        // Serialise generation across concurrent admin requests, then enforce
        // the 10-code cap on the server (never only in the UI).
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(${AFFILIATE_LOCK_KEY})`,
        );
        const existing = await tx.redeemCode.count({
          where: { kind: "AFFILIATE" },
        });
        if (existing + count > MAX_AFFILIATE_CODES) {
          throw new BadRequestError(
            "api.licensing.affiliateLimit",
            undefined,
            {
              max: MAX_AFFILIATE_CODES,
              remaining: Math.max(0, MAX_AFFILIATE_CODES - existing),
            },
          );
        }
      }

      for (let i = 0; i < count; i++) {
        const code = generateCode(kind);
        await tx.redeemCode.create({
          data: {
            codeHash: hashCode(code),
            kind,
            label: input.label?.trim() || null,
            durationDays,
            maxRedemptions: 1,
            expiresAt: input.expiresAt ?? null,
            createdBy: "admin",
          },
        });
        results.push({
          code,
          kind,
          durationDays,
          label: input.label?.trim() || null,
          expiresAt: input.expiresAt ?? null,
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return results;
}

export async function listLicenseCodes() {
  return prisma.redeemCode.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      label: true,
      durationDays: true,
      maxRedemptions: true,
      redemptionCount: true,
      active: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        select: { userId: true, kind: true, redeemedAt: true },
      },
    },
  });
}

/** Revoke a code that has not been redeemed. Redeemed codes are not touched. */
export async function revokeLicenseCode(codeId: string) {
  const code = await prisma.redeemCode.findUnique({ where: { id: codeId } });
  if (!code) throw new NotFoundError("api.resource.code");
  if (!code.active) return { updated: true as const };
  if (code.redemptionCount > 0)
    throw new BadRequestError("api.licensing.codeAlreadyRedeemed");
  await prisma.redeemCode.update({
    where: { id: codeId },
    data: { active: false, revokedAt: new Date(), revokedBy: "admin" },
  });
  return { updated: true as const };
}

// ────────────────────────────────────────────────────────────────────────────
// Admin: customers, owners, subscriptions
// ────────────────────────────────────────────────────────────────────────────

export type CustomerHistoryEntry = {
  id: string;
  kind: LicenseKind;
  durationDays: number;
  redeemedAt: Date;
  previousAccessExpiresAt: Date | null;
  newAccessExpiresAt: Date;
};

export type LicensingCustomer = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  entitlement: Entitlement;
  /** Activation and renewal history, newest first. */
  history: CustomerHistoryEntry[];
};

export async function listLicensingCustomers(): Promise<LicensingCustomer[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      subscription: { select: SUBSCRIPTION_SNAPSHOT_SELECT },
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        select: {
          id: true,
          kind: true,
          durationDays: true,
          redeemedAt: true,
          previousAccessExpiresAt: true,
          newAccessExpiresAt: true,
        },
      },
    },
  });
  const now = new Date();
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    entitlement: computeEntitlement(u.id, u.subscription, now),
    history: u.redemptions.map((r) => ({
      id: r.id,
      kind: normalizeKind(r.kind),
      durationDays: r.durationDays,
      redeemedAt: r.redeemedAt,
      previousAccessExpiresAt: r.previousAccessExpiresAt,
      newAccessExpiresAt: r.newAccessExpiresAt,
    })),
  }));
}

export type LicensingOverview = {
  codes: Awaited<ReturnType<typeof listLicenseCodes>>;
  customers: LicensingCustomer[];
  summary: {
    totalCustomers: number;
    owners: number;
    affiliates: number;
    premium: number;
    trial: number;
    regular: number;
    unactivated: number;
    expiredPremium: number;
    upcomingExpirations: number;
    affiliateCodesTotal: number;
    affiliateCodesRemaining: number;
  };
};

export async function getLicensingOverview(): Promise<LicensingOverview> {
  const [codes, customers] = await Promise.all([
    listLicenseCodes(),
    listLicensingCustomers(),
  ]);
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * DAY_MS);
  const affiliateCodesTotal = codes.filter(
    (c) => c.kind === "AFFILIATE",
  ).length;

  return {
    codes,
    customers,
    summary: {
      totalCustomers: customers.length,
      owners: customers.filter((c) => c.entitlement.isOwner).length,
      affiliates: customers.filter((c) => c.entitlement.isAffiliate).length,
      premium: customers.filter((c) => c.entitlement.category === "PREMIUM")
        .length,
      trial: customers.filter((c) => c.entitlement.category === "TRIAL")
        .length,
      regular: customers.filter((c) => c.entitlement.category === "REGULAR")
        .length,
      unactivated: customers.filter(
        (c) => c.entitlement.category === "UNACTIVATED",
      ).length,
      expiredPremium: customers.filter(
        (c) =>
          c.entitlement.core.active &&
          !c.entitlement.premium.active &&
          c.entitlement.premium.expiresAt !== null,
      ).length,
      upcomingExpirations: customers.filter(
        (c) =>
          c.entitlement.premium.active &&
          !c.entitlement.premium.permanent &&
          c.entitlement.premium.expiresAt !== null &&
          c.entitlement.premium.expiresAt <= soon,
      ).length,
      affiliateCodesTotal,
      affiliateCodesRemaining: Math.max(
        0,
        MAX_AFFILIATE_CODES - affiliateCodesTotal,
      ),
    },
  };
}

/** Grant permanent owner access. Server-enforced cap of two active owners. */
export async function grantOwner(userId: string): Promise<Entitlement> {
  const now = new Date();
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${OWNER_LOCK_KEY})`,
      );
      const sub = await ensureSubscriptionRow(tx, userId, now);
      if (sub.ownerGrantedAt && !sub.ownerRevokedAt)
        return computeEntitlement(userId, sub, now);

      const activeOwners = await tx.userSubscription.count({
        where: { ownerGrantedAt: { not: null }, ownerRevokedAt: null },
      });
      if (activeOwners >= MAX_OWNERS)
        throw new BadRequestError("api.licensing.ownerLimit", undefined, {
          max: MAX_OWNERS,
        });

      const updated = await tx.userSubscription.update({
        where: { userId },
        data: {
          ownerGrantedAt: now,
          ownerRevokedAt: null,
          coreActivatedAt: sub.coreActivatedAt ?? now,
          coreExpiresAt: null,
          accessRevokedAt: null,
          accessRevokedReason: null,
        },
      });
      return computeEntitlement(userId, updated, now);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await recordAudit(userId, {
    action: "licensing.owner_grant",
    entityType: "UserSubscription",
    entityId: userId,
    summary: "Owner access granted",
    metadata: { actor: "admin", targetUserId: userId },
  });
  return result;
}

/**
 * Revoke owner access. `confirm` must be true (prevents accidental clicks),
 * and the last active owner can never be removed.
 */
export async function revokeOwner(
  userId: string,
  confirm: boolean,
): Promise<Entitlement> {
  if (!confirm) throw new BadRequestError("api.licensing.confirmRequired");
  const now = new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${OWNER_LOCK_KEY})`,
      );
      const sub = await tx.userSubscription.findUnique({
        where: { userId },
      });
      if (!sub) throw new NotFoundError("api.resource.customer");
      if (!sub.ownerGrantedAt || sub.ownerRevokedAt)
        return computeEntitlement(userId, sub, now);

      const activeOwners = await tx.userSubscription.count({
        where: { ownerGrantedAt: { not: null }, ownerRevokedAt: null },
      });
      if (activeOwners <= 1)
        throw new BadRequestError("api.licensing.lastOwner");

      const updated = await tx.userSubscription.update({
        where: { userId },
        data: { ownerRevokedAt: now },
      });
      return computeEntitlement(userId, updated, now);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await recordAudit(userId, {
    action: "licensing.owner_revoke",
    entityType: "UserSubscription",
    entityId: userId,
    summary: "Owner access revoked",
    metadata: { actor: "admin", targetUserId: userId },
  });
  return result;
}

/** Revoke the time-bound premium entitlement (owners/affiliates unaffected). */
export async function revokePremium(userId: string): Promise<Entitlement> {
  const sub = await prisma.userSubscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError("api.resource.customer");
  const now = new Date();
  const updated = await prisma.userSubscription.update({
    where: { userId },
    data: { premiumRevokedAt: now },
  });
  await recordAudit(userId, {
    action: "licensing.premium_revoke",
    entityType: "UserSubscription",
    entityId: userId,
    summary: "Premium entitlement revoked",
    metadata: { actor: "admin", targetUserId: userId },
  });
  return computeEntitlement(userId, updated, now);
}

/**
 * Revoke ALL access for a customer (core + premium). Owners must be demoted
 * first, so an owner can never lose access by accident.
 */
export async function revokeAccess(
  userId: string,
  reason: string,
): Promise<Entitlement> {
  const sub = await prisma.userSubscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError("api.resource.customer");
  if (sub.ownerGrantedAt && !sub.ownerRevokedAt)
    throw new BadRequestError("api.licensing.revokeOwnerFirst");
  const now = new Date();
  const updated = await prisma.userSubscription.update({
    where: { userId },
    data: {
      accessRevokedAt: now,
      accessRevokedReason: reason?.trim() || null,
    },
  });
  await recordAudit(userId, {
    action: "licensing.access_revoke",
    entityType: "UserSubscription",
    entityId: userId,
    summary: reason?.trim() || "Access revoked",
    metadata: { actor: "admin", targetUserId: userId },
  });
  return computeEntitlement(userId, updated, now);
}

/** Restore access previously revoked with `revokeAccess`. */
export async function restoreAccess(userId: string): Promise<Entitlement> {
  const sub = await prisma.userSubscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError("api.resource.customer");
  const now = new Date();
  const updated = await prisma.userSubscription.update({
    where: { userId },
    data: { accessRevokedAt: null, accessRevokedReason: null },
  });
  await recordAudit(userId, {
    action: "licensing.access_restore",
    entityType: "UserSubscription",
    entityId: userId,
    summary: "Access restored",
    metadata: { actor: "admin", targetUserId: userId },
  });
  return computeEntitlement(userId, updated, now);
}

/**
 * Demote an affiliate to a regular customer. The permanent core access granted
 * by the affiliate code is intentionally kept; use `revokeCore` (or
 * `revokeAccess`) afterwards to remove it as well.
 */
export async function revokeAffiliate(
  userId: string,
  confirm: boolean,
): Promise<Entitlement> {
  if (!confirm) throw new BadRequestError("api.licensing.confirmRequired");
  const sub = await prisma.userSubscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError("api.resource.customer");
  const now = new Date();
  if (!sub.affiliateGrantedAt || sub.affiliateRevokedAt) {
    return computeEntitlement(userId, sub, now);
  }
  if (sub.ownerGrantedAt && !sub.ownerRevokedAt) {
    // An owner is never an affiliate; demote the owner first.
    throw new BadRequestError("api.licensing.revokeOwnerFirst");
  }
  const updated = await prisma.userSubscription.update({
    where: { userId },
    data: { affiliateRevokedAt: now },
  });
  await recordAudit(userId, {
    action: "licensing.affiliate_revoke",
    entityType: "UserSubscription",
    entityId: userId,
    summary: "Affiliate access revoked",
    metadata: { actor: "admin", targetUserId: userId },
  });
  return computeEntitlement(userId, updated, now);
}

/**
 * Remove core (and premium) access from a regular or trial customer. Owners and
 * affiliates must be demoted first so a permanent account is never removed by
 * accident. This is a targeted downgrade; `revokeAccess` is the global switch.
 */
export async function revokeCore(
  userId: string,
  confirm: boolean,
): Promise<Entitlement> {
  if (!confirm) throw new BadRequestError("api.licensing.confirmRequired");
  const sub = await prisma.userSubscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError("api.resource.customer");
  const now = new Date();
  const before = computeEntitlement(userId, sub, now);
  if (before.isOwner || before.isAffiliate) {
    throw new BadRequestError("api.licensing.demoteFirst");
  }
  const updated = await prisma.userSubscription.update({
    where: { userId },
    data: { coreRevokedAt: now, premiumRevokedAt: now },
  });
  await recordAudit(userId, {
    action: "licensing.core_revoke",
    entityType: "UserSubscription",
    entityId: userId,
    summary: "Core access revoked",
    metadata: { actor: "admin", targetUserId: userId },
  });
  return computeEntitlement(userId, updated, now);
}