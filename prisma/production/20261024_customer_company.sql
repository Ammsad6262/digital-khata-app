-- Customer shop/company name (optional).
-- Safe to run once against the production database.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
