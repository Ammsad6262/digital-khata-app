-- Digital Khata production delta - AI assistant persistence tables
-- Additive only. Idempotent. Safe to run while the app is live.
--
-- Creates the three tables the voice/text assistant uses:
--   AIUsageDaily     - one row per (day, model) for the free-tier Gemini rotation
--   AssistantAction  - a prepared write awaiting the owner's confirmation
--   AssistantThread  - short-lived per-user conversation context
--
-- Without these tables the runtime falls back to an in-memory copy (counters
-- reset on restart, pending actions cannot be confirmed after a redeploy, and
-- context is not shared between serverless instances). Applying this makes the
-- data persist in Postgres.
--
-- Run prisma/production/20261020_stage2_3_delta.sql first if it has not been
-- applied yet (the foreign keys below reference "User").

BEGIN;

CREATE TABLE IF NOT EXISTS "AIUsageDaily" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "rateLimited" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "cooldownUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    CONSTRAINT "AssistantAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIUsageDaily_day_idx" ON "AIUsageDaily"("day");
CREATE UNIQUE INDEX IF NOT EXISTS "AIUsageDaily_day_model_key" ON "AIUsageDaily"("day", "model");
CREATE INDEX IF NOT EXISTS "AssistantAction_userId_createdAt_idx" ON "AssistantAction"("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantAction_userId_idempotencyKey_key" ON "AssistantAction"("userId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantThread_userId_key" ON "AssistantThread"("userId");

-- Guarded foreign keys (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantAction_userId_fkey') THEN
        ALTER TABLE "AssistantAction"
            ADD CONSTRAINT "AssistantAction_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantThread_userId_fkey') THEN
        ALTER TABLE "AssistantThread"
            ADD CONSTRAINT "AssistantThread_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
