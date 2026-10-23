-- Digital Khata production delta - Follow-up workflow (sales growth assistant)
-- Additive only. Idempotent. Run inside the transaction below.
--
-- Adds one table: "FollowUp". Nothing existing is changed, so this is safe to
-- apply while the app is live. Run prisma/production/20261020_stage2_3_delta.sql
-- first if it has not been applied yet.

BEGIN;

-- CreateTable
CREATE TABLE IF NOT EXISTS "FollowUp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'reorder',
    "reason" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "outcomeNote" TEXT,
    "contactedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FollowUp_userId_outcome_idx" ON "FollowUp"("userId", "outcome");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FollowUp_customerId_idx" ON "FollowUp"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FollowUp_productId_idx" ON "FollowUp"("productId");

-- AddForeignKey (guarded so re-running is harmless)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FollowUp_userId_fkey'
    ) THEN
        ALTER TABLE "FollowUp"
            ADD CONSTRAINT "FollowUp_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FollowUp_customerId_fkey'
    ) THEN
        ALTER TABLE "FollowUp"
            ADD CONSTRAINT "FollowUp_customerId_fkey"
            FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FollowUp_productId_fkey'
    ) THEN
        ALTER TABLE "FollowUp"
            ADD CONSTRAINT "FollowUp_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
