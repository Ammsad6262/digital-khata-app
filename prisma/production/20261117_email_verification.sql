-- Email verification (2026-11-17)
--
-- Adds:
--   * "User"."emailVerifiedAt" (NULL = not verified)
--   * "EmailVerificationCode" (server-only, hashed single-use codes)
--
-- Additive and safe to run more than once (it is applied on every Vercel build
-- through scripts/apply-production-ddl.mjs).
--
-- Grandfathering: every account that existed when this column was created is
-- marked verified, so shipping the feature cannot lock an existing owner out.
-- The UPDATE is deliberately guarded by "the column did not exist before this
-- run": re-running the file on a later deploy must NOT mark new sign-ups as
-- verified, or turning enforcement on would silently do nothing for them.
--
-- Security notes:
--   * Only sha256(code + ":" + SESSION_SECRET) is stored. The plaintext 6-digit
--     code is never written to the database or to logs.
--   * The table is server-only. RLS is enabled (not FORCED) so the Prisma role
--     can read/write it while anon/authenticated PostgREST roles stay denied
--     (there are no policies for them).
--   * Codes are single-use, expire after 10 minutes, and are revoked when a
--     newer code is issued or the attempt cap is reached.

DO $$
DECLARE
    column_existed boolean;
BEGIN
    -- Schema-agnostic: to_regclass resolves "User" the same way the ALTER
    -- below does (respecting search_path and the quoted mixed-case name).
    SELECT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = to_regclass('"User"')
          AND attname = 'emailVerifiedAt'
          AND NOT attisdropped
    ) INTO column_existed;

    IF NOT column_existed THEN
        ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

        -- One-time grandfather: every pre-existing account is treated as
        -- verified. Safe because it runs only when the column is first added.
        UPDATE "User" SET "emailVerifiedAt" = now() WHERE "emailVerifiedAt" IS NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EmailVerificationCode" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "codeHash"   TEXT NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailVerificationCode_userId_createdAt_idx"
    ON "EmailVerificationCode" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "EmailVerificationCode_codeHash_idx"
    ON "EmailVerificationCode" ("codeHash");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'EmailVerificationCode_userId_fkey'
    ) THEN
        ALTER TABLE "EmailVerificationCode"
            ADD CONSTRAINT "EmailVerificationCode_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "EmailVerificationCode" ENABLE ROW LEVEL SECURITY;