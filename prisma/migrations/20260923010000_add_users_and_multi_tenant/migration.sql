-- Migration: add_users_and_multi_tenant
-- Date: 2026-09-23
--
-- Adds the User model and userId columns to all business tables.
-- userId is nullable — existing data (null userId) is visible to all users
-- (backward compat). New data created by a logged-in user gets their userId.

-- 1. Create User table
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Unique email constraint
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- 2. Add userId columns to all business tables (nullable for backward compat)
ALTER TABLE "Customer" ADD COLUMN "userId" TEXT;
ALTER TABLE "Product" ADD COLUMN "userId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "userId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "userId" TEXT;
ALTER TABLE "CustomerAdjustment" ADD COLUMN "userId" TEXT;
ALTER TABLE "StockMove" ADD COLUMN "userId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "userId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "userId" TEXT;

-- 3. Add foreign key constraints (ON DELETE CASCADE — if user is deleted, their data goes too)
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerAdjustment" ADD CONSTRAINT "CustomerAdjustment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Add indexes on userId for fast filtering
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");
CREATE INDEX "Product_userId_idx" ON "Product"("userId");
CREATE INDEX "Sale_userId_idx" ON "Sale"("userId");
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");
CREATE INDEX "CustomerAdjustment_userId_idx" ON "CustomerAdjustment"("userId");
CREATE INDEX "StockMove_userId_idx" ON "StockMove"("userId");
CREATE INDEX "Expense_userId_idx" ON "Expense"("userId");
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
