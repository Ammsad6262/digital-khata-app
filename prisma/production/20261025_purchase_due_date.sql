-- Digital Khata production delta - purchase due dates / overdue payables
-- Additive only. Idempotent. Safe to run while the app is live.
--
-- Adds one nullable column and one index to "Purchase". Existing rows get NULL,
-- which means "no agreed payment date" - they are never counted as overdue.
-- Run prisma/production/20261020_stage2_3_delta.sql first if it has not been
-- applied yet.

BEGIN;

ALTER TABLE "Purchase"
    ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Purchase_dueDate_idx" ON "Purchase"("dueDate");

COMMIT;
