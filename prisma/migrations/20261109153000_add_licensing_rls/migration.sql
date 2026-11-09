-- Row Level Security for user-owned licensing records.
--
-- Mirrors the existing `PasswordResetCode` convention: RLS is enabled on the
-- user-owned tables so a hardened deployment can attach per-user policies.
-- The current runtime connects as the table owner (which bypasses RLS), so
-- this is a no-op for the application but correct for the schema.
--
-- `RedeemCode` is intentionally NOT enabled here: it is an admin-global table
-- and must stay readable during code validation.

ALTER TABLE "UserSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RedeemCodeRedemption" ENABLE ROW LEVEL SECURITY;