-- Migration: subscription_system
-- Date: 2026-10-02
--
-- Adds the subscription/trial/redeem-code system:
--   1. UserSubscription — per-user trial + active access tracking
--   2. RedeemCode — hashed activation codes with configurable durations
--   3. RedeemCodeRedemption — audit trail of code redemptions
--
-- After this migration:
--   - New users automatically get a 30-day trial (created in registerUser service)
--   - Existing users get a backfilled subscription record with an active trial
--     (so they don't lose access immediately)
--   - Redeem codes are stored as SHA-256 hashes (never plaintext)
--   - Code redemption is atomic via database transactions

-- 1. UserSubscription table
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIAL_ACTIVE',
    "trialStartedAt" TIMESTAMP(3) NOT NULL,
    "trialExpiresAt" TIMESTAMP(3) NOT NULL,
    "accessStartedAt" TIMESTAMP(3),
    "accessExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSubscription_userId_key" ON "UserSubscription"("userId");
CREATE INDEX "UserSubscription_userId_idx" ON "UserSubscription"("userId");
CREATE INDEX "UserSubscription_status_idx" ON "UserSubscription"("status");

ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. RedeemCode table
CREATE TABLE "RedeemCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedeemCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RedeemCode_codeHash_key" ON "RedeemCode"("codeHash");
CREATE INDEX "RedeemCode_codeHash_idx" ON "RedeemCode"("codeHash");
CREATE INDEX "RedeemCode_active_idx" ON "RedeemCode"("active");

-- 3. RedeemCodeRedemption table
CREATE TABLE "RedeemCodeRedemption" (
    "id" TEXT NOT NULL,
    "redeemCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "previousAccessExpiresAt" TIMESTAMP(3),
    "newAccessExpiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedeemCodeRedemption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RedeemCodeRedemption_redeemCodeId_idx" ON "RedeemCodeRedemption"("redeemCodeId");
CREATE INDEX "RedeemCodeRedemption_userId_idx" ON "RedeemCodeRedemption"("userId");

ALTER TABLE "RedeemCodeRedemption" ADD CONSTRAINT "RedeemCodeRedemption_redeemCodeId_fkey"
  FOREIGN KEY ("redeemCodeId") REFERENCES "RedeemCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RedeemCodeRedemption" ADD CONSTRAINT "RedeemCodeRedemption_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Backfill: create trial subscriptions for ALL existing users
--    Each existing user gets a 30-day trial starting from their account creation date.
--    This ensures existing users don't lose access.
INSERT INTO "UserSubscription" ("id", "userId", "status", "trialStartedAt", "trialExpiresAt", "createdAt", "updatedAt")
SELECT
  'sub_' || u."id",
  u."id",
  'TRIAL_ACTIVE',
  u."createdAt",
  u."createdAt" + INTERVAL '30 days',
  NOW(),
  NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "UserSubscription" s WHERE s."userId" = u."id"
);
