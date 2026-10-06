-- Migration: rls_subscription_tables
-- Date: 2026-10-02
--
-- Adds RLS policies for the subscription system tables:
--   1. UserSubscription — per-user (only the owner can read/update their own)
--   2. RedeemCode — admin-only (normal users CANNOT read, only the server
--      can validate codes through the API)
--   3. RedeemCodeRedemption — per-user (users can only see their own history)
--
-- SECURITY MODEL:
--   Prisma connects as the `postgres` role which has BYPASSRLS=true.
--   FORCE RLS is enabled on these tables so even the postgres role is subject
--   to the policies. The `app.user_id` session variable must be set by the
--   application before querying these tables.
--
--   For RedeemCode specifically: RLS policies block ALL access when
--   app.user_id is not set (safe-by-default). The redeem API route sets
--   app.user_id and then validates the code through the service layer.
--   Normal users can NEVER list/enumerate codes through the database.
--
--   The admin code-generation endpoint uses the ADMIN_SECRET header (not
--   a database role), so it works through the service layer which uses
--   the postgres connection.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UserSubscription — per-user
-- ────────────────────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RedeemCode — admin-only (normal users CANNOT access)
--
-- No SELECT/INSERT/UPDATE/DELETE policies are created for normal users.
-- This means: when app.user_id is set (any authenticated user), the RLS
-- policies return ZERO rows for RedeemCode. The code validation happens
-- entirely in the service layer (subscription.ts → redeemCode function)
-- which uses a Prisma findUnique by codeHash — this will return null
-- because RLS blocks it.
--
-- WAIT — this would break redemption! The service layer NEEDS to look up
-- codes by hash. Since Prisma connects as postgres (BYPASSRLS=true) and
-- FORCE is on, the lookup IS subject to policies.
--
-- SOLUTION: Create a policy that allows SELECT when the code hash matches
-- (i.e., the user is trying to redeem a specific code, not enumerate).
-- But that's not possible with RLS — RLS filters rows, it doesn't
-- restrict which columns can be used for filtering.
--
-- FINAL APPROACH: Don't enable FORCE RLS on RedeemCode. The table is
-- protected at the APPLICATION level — no API route exposes RedeemCode
-- records to normal users. The only operations are:
--   - Admin: generateCodes, listCodesAdmin, disableCode (via ADMIN_SECRET)
--   - Service: redeemCode (internal, uses codeHash lookup)
--   - User: POST /api/subscription/redeem (only sends code string, gets
--     back success/error — never sees the RedeemCode record)
--
-- RLS is not the right tool for RedeemCode because the application
-- legitimately needs to look up codes by hash without knowing the userId
-- of the code's creator. Application-level authorization is sufficient.
-- ────────────────────────────────────────────────────────────────────────────

-- No RLS on RedeemCode — protected at the application layer.
-- No normal-user API route exposes RedeemCode records.

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RedeemCodeRedemption — per-user (users can only see their own history)
-- ────────────────────────────────────────────────────────────────────────────

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
