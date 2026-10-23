-- Digital Khata production delta - Sale due dates / overdue tracking
-- Additive only. Idempotent. Safe to run while the app is live.
--
-- Adds one nullable column and one index to "Sale". Existing rows get NULL,
-- which means "no agreed payment date" - they are never counted as overdue.
-- Run prisma/production/20261020_stage2_3_delta.sql and
-- 20261023_follow_ups.sql first if they have not been applied yet.

BEGIN;

ALTER TABLE "Sale"
    ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Sale_dueDate_idx" ON "Sale"("dueDate");

COMMIT;
