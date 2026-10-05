-- Migration: re_enable_rls_subscription
-- Date: 2026-10-02
--
-- Re-enables FORCE RLS on UserSubscription and RedeemCodeRedemption.
-- The application now sets app.user_id via setUserContext() (called by
-- requireUserId() and requireActiveAccess() in get-current-user.ts).
--
-- SECURITY MODEL:
--   - Prisma connects as `postgres` (BYPASSRLS=true)
--   - FORCE RLS means even the postgres role is subject to policies
--   - app.user_id is set on every authenticated request
--   - Without app.user_id, all rows are filtered (safe-by-default)
--
--   RedeemCode table does NOT have RLS — it needs to be looked up by
--   codeHash without knowing the code creator's userId. No API route
--   exposes RedeemCode records to normal users (application-level auth).

-- UserSubscription: per-user
ALTER TABLE "UserSubscription" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_select_own" ON "UserSubscription";
CREATE POLICY "sub_select_own" ON "UserSubscription"
  FOR SELECT
  USING ("userId" = current_setting('app.user_id', true)::text);

DROP POLICY IF EXISTS "sub_insert_own" ON "UserSubscription";
CREATE POLICY "sub_insert_own" ON "UserSubscription"
  FOR INSERT
  WITH CHECK ("userId" = current_setting('app.user_id', true)::text);

DROP POLICY IF EXISTS "sub_update_own" ON "UserSubscription";
CREATE POLICY "sub_update_own" ON "UserSubscription"
  FOR UPDATE
  USING ("userId" = current_setting('app.user_id', true)::text)
  WITH CHECK ("userId" = current_setting('app.user_id', true)::text);

DROP POLICY IF EXISTS "sub_delete_own" ON "UserSubscription";
CREATE POLICY "sub_delete_own" ON "UserSubscription"
  FOR DELETE
  USING ("userId" = current_setting('app.user_id', true)::text);

-- RedeemCodeRedemption: per-user (users see only their own history)
ALTER TABLE "RedeemCodeRedemption" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "redemption_select_own" ON "RedeemCodeRedemption";
CREATE POLICY "redemption_select_own" ON "RedeemCodeRedemption"
  FOR SELECT
  USING ("userId" = current_setting('app.user_id', true)::text);

DROP POLICY IF EXISTS "redemption_insert_own" ON "RedeemCodeRedemption";
CREATE POLICY "redemption_insert_own" ON "RedeemCodeRedemption"
  FOR INSERT
  WITH CHECK ("userId" = current_setting('app.user_id', true)::text);

DROP POLICY IF EXISTS "redemption_update_own" ON "RedeemCodeRedemption";
CREATE POLICY "redemption_update_own" ON "RedeemCodeRedemption"
  FOR UPDATE
  USING ("userId" = current_setting('app.user_id', true)::text)
  WITH CHECK ("userId" = current_setting('app.user_id', true)::text);

DROP POLICY IF EXISTS "redemption_delete_own" ON "RedeemCodeRedemption";
CREATE POLICY "redemption_delete_own" ON "RedeemCodeRedemption"
  FOR DELETE
  USING ("userId" = current_setting('app.user_id', true)::text);
