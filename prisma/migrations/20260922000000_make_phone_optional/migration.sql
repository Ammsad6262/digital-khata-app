-- ────────────────────────────────────────────────────────────────────────────
-- Migration: make_phone_optional
-- Date: 2026-09-22
--
-- Makes the Customer.phone column nullable so customers can be created
-- without a phone number.
--
-- Postgres UNIQUE constraints allow multiple NULLs by default, so making
-- the column nullable doesn't break the uniqueness guarantee for rows
-- that DO have a phone number.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Customer" ALTER COLUMN "phone" DROP NOT NULL;
