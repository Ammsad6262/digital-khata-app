-- One free trial per mailbox, even across account deletion.
--
-- `UserSubscription` is deleted with its user (ON DELETE CASCADE), so the
-- trial record disappeared with the account and the same email could start a
-- fresh 14-day trial indefinitely. This table is not owned by a user.
--
-- Additive and idempotent; it is applied on every Vercel build through
-- scripts/apply-production-ddl.mjs.

CREATE TABLE IF NOT EXISTS "TrialClaim" (
    "id"             TEXT NOT NULL,
    "emailHash"      TEXT NOT NULL,
    "trialGrantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrialClaim_emailHash_key"
    ON "TrialClaim" ("emailHash");

CREATE INDEX IF NOT EXISTS "TrialClaim_trialGrantedAt_idx"
    ON "TrialClaim" ("trialGrantedAt");

-- Server-only. With RLS enabled and no policies, PostgREST's anon/authenticated
-- roles read nothing; the table owner (the Prisma role) is not affected.
ALTER TABLE "TrialClaim" ENABLE ROW LEVEL SECURITY;
