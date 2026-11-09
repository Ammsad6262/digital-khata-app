-- Enforce row-level security for the user-owned licensing tables.
--
-- Before this migration RLS was only ENABLED on `UserSubscription` and
-- `RedeemCodeRedemption`, had no policies, and the application connected as the
-- table owner / superuser. The result was a no-op: every session could read
-- every row.
--
-- This migration makes RLS real:
--   1. creates a restricted application role (`khata_app`) that is neither the
--      owner nor a superuser nor BYPASSRLS, so RLS actually applies to it,
--   2. grants that role only the access it needs, and
--   3. adds per-user policies keyed on the `app.user_id` session variable.
--
-- The application enters this role only for user-scoped queries, inside a
-- single transaction:
--
--   SET LOCAL ROLE khata_app;
--   SELECT set_config('app.user_id', <userId>, true);
--
-- Admin/system operations continue to run as the owner and therefore bypass
-- RLS on purpose (that is the privileged path). No FORCE ROW LEVEL SECURITY is
-- used, precisely so the owner/admin path keeps working.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khata_app') THEN
    CREATE ROLE khata_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END
$$;

-- Allow the connecting role to SET ROLE into the restricted role.
DO $$
BEGIN
  EXECUTE format('GRANT khata_app TO %I', current_user);
EXCEPTION
  WHEN insufficient_privilege THEN NULL;  -- not the role owner/admin
  WHEN duplicate_object THEN NULL;       -- already a member
END
$$;

GRANT USAGE ON SCHEMA public TO khata_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "UserSubscription" TO khata_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RedeemCodeRedemption" TO khata_app;
GRANT SELECT, INSERT, UPDATE ON "RedeemCode" TO khata_app;
-- Read access to the user row for relation joins inside the restricted role.
GRANT SELECT ON "User" TO khata_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO khata_app;

-- ── Per-user policies ───────────────────────────────────────────────────────
-- current_setting(..., true) returns NULL when unset, so an unset context
-- matches no row (fail-closed).

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
