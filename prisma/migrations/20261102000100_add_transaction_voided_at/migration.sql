-- Soft-void support for the Transaction ledger.
--
-- Voiding a sale (or payment / expense / stock move / supplier payment) used to
-- HARD DELETE the denormalized Transaction mirror rows, which threw away the
-- financial history. It now marks them `voidedAt` instead, so the audit trail
-- survives while active-ledger reads keep filtering `voidedAt IS NULL`.
--
-- IDEMPOTENT so it is safe on databases provisioned with `prisma db push`.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_voidedAt_idx" ON "Transaction"("voidedAt");
