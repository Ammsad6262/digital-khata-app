-- Digital Khata production delta - whole-sale discount on sales
-- Additive only. Idempotent. Safe to run while the app is live.
--
-- Adds one column to "Sale". Existing rows get 0, which means "no discount",
-- so every historical sale keeps its current total.
-- Run prisma/production/20261020_stage2_3_delta.sql,
-- 20261023_follow_ups.sql and 20261023_sale_due_date.sql first if they have
-- not been applied yet.

BEGIN;

ALTER TABLE "Sale"
    ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;

COMMIT;
