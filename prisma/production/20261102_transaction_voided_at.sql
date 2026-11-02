-- Digital Khata production delta - soft-void the transaction ledger
-- Additive only. Idempotent. Safe to run while the app is live.
--
-- Adds "Transaction"."voidedAt". Voiding a sale (or payment / expense / stock
-- move / supplier payment) used to HARD DELETE the denormalized Transaction
-- mirror rows, which destroyed the financial history. It now sets voidedAt
-- instead, so the audit trail is preserved; active-ledger reads filter
-- "voidedAt" IS NULL.
--
-- Existing rows get NULL (active), which is correct: they were never voided.

BEGIN;

ALTER TABLE "Transaction"
    ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Transaction_voidedAt_idx" ON "Transaction"("voidedAt");

COMMIT;
