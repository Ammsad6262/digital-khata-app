-- Commercial licensing — product / premium / affiliate / owner entitlements.
--
-- Additive and idempotent: safe to re-run. It only adds nullable columns, one
-- defaulted column, one index, and enables RLS.
--
-- This file is listed in `scripts/apply-production-ddl.mjs`, so a Vercel
-- production build applies it (build-gated: if the SQL fails, the build fails
-- and the previous deployment stays live). It is also safe to apply manually:
--
--   psql "$DIRECT_URL" -f prisma/production/20261109_commercial_licensing.sql
--
-- then record the migrations:
--
--   npx prisma migrate resolve --applied 20261109151410_add_commercial_licensing
--   npx prisma migrate resolve --applied 20261109153000_add_licensing_rls
--   npx prisma migrate resolve --applied 20261109160000_add_core_trial_expiry
--   npx prisma migrate resolve --applied 20261109170000_enforce_licensing_rls

ALTER TABLE "RedeemCode" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PREMIUM';
ALTER TABLE "RedeemCode" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "RedeemCode" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "RedeemCode" ADD COLUMN IF NOT EXISTS "revokedBy" TEXT;

CREATE INDEX IF NOT EXISTS "RedeemCode_kind_idx" ON "RedeemCode"("kind");

ALTER TABLE "RedeemCodeRedemption" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PREMIUM';

ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "accessRevokedAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "accessRevokedReason" TEXT;
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "affiliateGrantedAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "affiliateRevokedAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "coreActivatedAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "coreExpiresAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "coreRevokedAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "ownerGrantedAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "ownerRevokedAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "premiumExpiresAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "premiumRevokedAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "premiumStartedAt" TIMESTAMP(3);

-- ── Grandfather existing customers ────────────────────────────────────────
-- A non-NULL accessExpiresAt means the user redeemed a legacy duration code.
-- Give them permanent core access and keep premium until the legacy expiry.
UPDATE "UserSubscription"
SET
  "coreActivatedAt" = COALESCE("coreActivatedAt", "accessStartedAt", "createdAt"),
  "coreExpiresAt" = NULL,
  "premiumStartedAt" = COALESCE("premiumStartedAt", "accessStartedAt"),
  "premiumExpiresAt" = COALESCE("premiumExpiresAt", "accessExpiresAt")
WHERE "accessExpiresAt" IS NOT NULL;

-- Preserve still-active legacy trials as core-only trials (no permanent core,
-- no premium).
UPDATE "UserSubscription"
SET
  "coreActivatedAt" = COALESCE("coreActivatedAt", "trialStartedAt"),
  "coreExpiresAt" = COALESCE("coreExpiresAt", "trialExpiresAt")
WHERE "accessExpiresAt" IS NULL
  AND "coreActivatedAt" IS NULL
  AND "trialExpiresAt" > NOW();

-- ── Row Level Security (enforced) ───────────────────────────────────────────
-- Enable RLS, create a restricted role that is subject to it, and add the
-- per-user policies keyed on `app.user_id`. User-scoped queries run
-- `SET LOCAL ROLE khata_app` + `set_config('app.user_id', <userId>, true)`.
-- Requires `LICENSING_RLS_ROLE=khata_app` in the app environment to take effect
-- (unset = run as owner, RLS not filtered).
--
-- The role/grant steps are best-effort so an insufficiently privileged deploy
-- user cannot fail the whole build; the columns, policies and RLS flags above
-- and below always apply. The table owner bypasses RLS unless FORCE is set
-- (it is not), which is what the admin/system path relies on.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khata_app') THEN
    BEGIN
      CREATE ROLE khata_app
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'khata_app not created (insufficient privilege); RLS role enforcement stays off';
    END;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khata_app') THEN
    BEGIN
      EXECUTE format('GRANT khata_app TO %I', current_user);
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN duplicate_object THEN NULL;
    END;
    EXECUTE 'GRANT USAGE ON SCHEMA public TO khata_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "UserSubscription" TO khata_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "RedeemCodeRedemption" TO khata_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "RedeemCode" TO khata_app';
    EXECUTE 'GRANT SELECT ON "User" TO khata_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO khata_app';
  END IF;
END
$$;

DROP POLICY IF EXISTS user_subscription_owner ON "UserSubscription";
CREATE POLICY user_subscription_owner ON "UserSubscription"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS redeem_code_redemption_owner ON "RedeemCodeRedemption";
CREATE POLICY redeem_code_redemption_owner ON "RedeemCodeRedemption"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

ALTER TABLE "UserSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RedeemCodeRedemption" ENABLE ROW LEVEL SECURITY;