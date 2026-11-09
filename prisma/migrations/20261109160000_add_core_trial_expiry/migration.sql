-- Add an optional core expiry so the existing 30-day trial can be preserved
-- as a core-only trial without granting permanent access.
--
--   coreExpiresAt IS NULL  -> permanent paid core (regular / affiliate / owner)
--   coreExpiresAt = date   -> trial core; access ends at that date
--
-- This migration is additive and idempotent for the data updates.

ALTER TABLE "UserSubscription" ADD COLUMN "coreExpiresAt" TIMESTAMP(3);

-- 1. Grandfather existing paying customers.
-- A non-NULL accessExpiresAt means the user redeemed at least one legacy
-- duration code. Give them permanent core access and keep their premium
-- entitlement until the legacy expiry (or the later of any new premium).
UPDATE "UserSubscription"
SET
  "coreActivatedAt" = COALESCE("coreActivatedAt", "accessStartedAt", "createdAt"),
  "coreExpiresAt" = NULL,
  "premiumStartedAt" = COALESCE("premiumStartedAt", "accessStartedAt"),
  "premiumExpiresAt" = COALESCE("premiumExpiresAt", "accessExpiresAt")
WHERE "accessExpiresAt" IS NOT NULL;

-- 2. Preserve still-active legacy trials as core-only trials.
-- Users with no legacy paid access and a future trial expiry keep access until
-- the trial ends; they do NOT get permanent core access.
UPDATE "UserSubscription"
SET
  "coreActivatedAt" = COALESCE("coreActivatedAt", "trialStartedAt"),
  "coreExpiresAt" = COALESCE("coreExpiresAt", "trialExpiresAt")
WHERE "accessExpiresAt" IS NULL
  AND "coreActivatedAt" IS NULL
  AND "trialExpiresAt" > NOW();