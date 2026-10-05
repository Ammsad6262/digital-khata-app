-- Revert FORCE RLS on subscription tables (application-level auth is sufficient)
DROP POLICY IF EXISTS "sub_select_own" ON "UserSubscription";
DROP POLICY IF EXISTS "sub_insert_own" ON "UserSubscription";
DROP POLICY IF EXISTS "sub_update_own" ON "UserSubscription";
DROP POLICY IF EXISTS "sub_delete_own" ON "UserSubscription";
DROP POLICY IF EXISTS "redemption_select_own" ON "RedeemCodeRedemption";
DROP POLICY IF EXISTS "redemption_insert_own" ON "RedeemCodeRedemption";
DROP POLICY IF EXISTS "redemption_update_own" ON "RedeemCodeRedemption";
DROP POLICY IF EXISTS "redemption_delete_own" ON "RedeemCodeRedemption";
ALTER TABLE "UserSubscription" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "RedeemCodeRedemption" NO FORCE ROW LEVEL SECURITY;
