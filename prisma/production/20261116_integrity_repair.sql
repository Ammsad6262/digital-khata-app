-- Integrity repair for databases that were built by hand from
-- `prisma/production/*.sql` instead of from `prisma/migrations/`.
--
-- Applying those delta files alone leaves out six foreign keys and five
-- indexes that the Prisma schema expects, because those objects were created
-- in the baseline migration, not in the deltas. The live database was missing
-- exactly these (verified 2026-11-16) and had accumulated orphan rows because
-- of it:
--
--   * Setting.userId            → 22 orphan rows
--   * UserSubscription.userId   → 26 orphan rows
--
-- This file only repairs the schema. Remove orphan rows first if any exist,
-- otherwise the foreign keys will refuse to validate. `scripts/db-verify.ts`
-- reports them; `scripts/db-cleanup.ts --apply` removes them.
--
-- Additive and idempotent: safe to run more than once.

-- 1. Missing unique index -----------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "Setting_userId_key" ON "Setting"("userId");

-- 2. Missing indexes on SmartEntrySession -------------------------------------
CREATE INDEX IF NOT EXISTS "SmartEntrySession_userId_createdAt_idx" ON "SmartEntrySession"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SmartEntrySession_status_expiresAt_idx" ON "SmartEntrySession"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "SmartEntrySession_resolvedCustomerId_idx" ON "SmartEntrySession"("resolvedCustomerId");
CREATE INDEX IF NOT EXISTS "SmartEntrySession_resolvedProductId_idx" ON "SmartEntrySession"("resolvedProductId");

-- 3. Missing foreign keys -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Setting_userId_fkey') THEN
    ALTER TABLE "Setting" ADD CONSTRAINT "Setting_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserSubscription_userId_fkey') THEN
    ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RedeemCodeRedemption_userId_fkey') THEN
    ALTER TABLE "RedeemCodeRedemption" ADD CONSTRAINT "RedeemCodeRedemption_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RedeemCodeRedemption_redeemCodeId_fkey') THEN
    ALTER TABLE "RedeemCodeRedemption" ADD CONSTRAINT "RedeemCodeRedemption_redeemCodeId_fkey"
      FOREIGN KEY ("redeemCodeId") REFERENCES "RedeemCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SmartEntrySession_resolvedCustomerId_fkey') THEN
    ALTER TABLE "SmartEntrySession" ADD CONSTRAINT "SmartEntrySession_resolvedCustomerId_fkey"
      FOREIGN KEY ("resolvedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SmartEntrySession_resolvedProductId_fkey') THEN
    ALTER TABLE "SmartEntrySession" ADD CONSTRAINT "SmartEntrySession_resolvedProductId_fkey"
      FOREIGN KEY ("resolvedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 4. Verify: these must all return 1 ------------------------------------------
-- SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='Setting_userId_key';
-- SELECT count(*) FROM pg_constraint WHERE conname='Setting_userId_fkey';
