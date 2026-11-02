-- AI assistant persistence: daily model-usage counters, pending actions, and
-- conversation context.
--
-- These three tables back the free-tier Gemini rotation and the confirm/execute
-- flow. The runtime uses them through Prisma and falls back to an in-memory copy
-- only when a table is missing, so applying this migration removes that fallback.
--
-- Written to be IDEMPOTENT (IF NOT EXISTS / guarded constraints) because several
-- databases in this project were provisioned with `prisma db push` and may
-- already contain these tables. The DDL below is exactly what
-- `prisma migrate diff` produces for these models, so a fresh database and an
-- already-populated one converge to the same schema.

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIUsageDaily_day_idx" ON "AIUsageDaily"("day");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AIUsageDaily_day_model_key" ON "AIUsageDaily"("day", "model");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssistantAction_userId_createdAt_idx" ON "AssistantAction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantAction_userId_idempotencyKey_key" ON "AssistantAction"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantThread_userId_key" ON "AssistantThread"("userId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantAction_userId_fkey') THEN
        ALTER TABLE "AssistantAction"
            ADD CONSTRAINT "AssistantAction_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantThread_userId_fkey') THEN
        ALTER TABLE "AssistantThread"
            ADD CONSTRAINT "AssistantThread_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
