-- Admin-issued password reset codes (2026-10-25)
--
-- Run this in the Supabase SQL editor before deploying the password-reset
-- feature. It is additive and safe to run more than once.
--
-- Security notes:
--   * Only a salted SHA-256 hash is stored. The plaintext code is shown once
--     to the admin and is never written to the database.
--   * The table is server-only. RLS is enabled (not FORCE) so the table owner
--     used by Prisma can read/write it, while anon/authenticated PostgREST
--     roles are denied by default because there are no policies.
--   * Codes are single-use, expire after 30 minutes, and older unused codes
--     are revoked when a new one is issued.

CREATE TABLE IF NOT EXISTS "PasswordResetCode" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "codeHash"  TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "attempts"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PasswordResetCode_userId_expiresAt_idx"
    ON "PasswordResetCode" ("userId", "expiresAt");

CREATE INDEX IF NOT EXISTS "PasswordResetCode_codeHash_idx"
    ON "PasswordResetCode" ("codeHash");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetCode_userId_fkey'
    ) THEN
        ALTER TABLE "PasswordResetCode"
            ADD CONSTRAINT "PasswordResetCode_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "PasswordResetCode" ENABLE ROW LEVEL SECURITY;
