-- Migration: add_smart_entry_session
-- Date: 2026-10-06
--
-- Adds the SmartEntrySession table for the Smart Khata Entry feature.
-- This is the pending-operation session created by AI interpretation
-- and confirmed by the user before being executed via SaleService.
--
-- IMPORTANT: AI never writes to this table directly. The /api/smart-entry/interpret
-- route creates the row using BACKEND-resolved customer/product IDs. The
-- /api/smart-entry/execute route re-validates and calls the existing
-- SaleService.createSale() — the same code path as the manual sale form.

-- 1. Create the SmartEntrySession table
CREATE TABLE "SmartEntrySession" (
    "id"                  TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'INTERPRETING',
    "inputType"           TEXT NOT NULL,
    "transcript"          TEXT,
    "rawAiResponse"       JSONB,
    "intent"              TEXT,
    "customerNameRaw"     TEXT,
    "productNameRaw"      TEXT,
    "quantityRaw"         DECIMAL(12,3),
    "unitRaw"             TEXT,
    "resolvedCustomerId"  TEXT,
    "resolvedProductId"   TEXT,
    "resolvedUnit"        TEXT,
    "resolvedQuantity"    DECIMAL(12,3),
    "resolvedUnitPrice"   DECIMAL(12,2),
    "resolvedAmount"      DECIMAL(12,2),
    "provider"            TEXT,
    "confidence"          DOUBLE PRECISION,
    "createdSaleId"       TEXT,
    "expiresAt"           TIMESTAMP(3) NOT NULL,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "completedAt"         TIMESTAMP(3),

    CONSTRAINT "SmartEntrySession_pkey" PRIMARY KEY ("id")
);

-- 2. Foreign keys
-- userId → User (CASCADE — if user is deleted, their sessions go too)
ALTER TABLE "SmartEntrySession"
  ADD CONSTRAINT "SmartEntrySession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- resolvedCustomerId → Customer (SET NULL — if customer is deleted, the session
-- is preserved for audit but no longer linked)
ALTER TABLE "SmartEntrySession"
  ADD CONSTRAINT "SmartEntrySession_resolvedCustomerId_fkey"
  FOREIGN KEY ("resolvedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- resolvedProductId → Product (SET NULL — same reasoning)
ALTER TABLE "SmartEntrySession"
  ADD CONSTRAINT "SmartEntrySession_resolvedProductId_fkey"
  FOREIGN KEY ("resolvedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Indexes for common query patterns
CREATE INDEX "SmartEntrySession_userId_createdAt_idx" ON "SmartEntrySession"("userId", "createdAt");
CREATE INDEX "SmartEntrySession_status_expiresAt_idx" ON "SmartEntrySession"("status", "expiresAt");
CREATE INDEX "SmartEntrySession_resolvedCustomerId_idx" ON "SmartEntrySession"("resolvedCustomerId");
CREATE INDEX "SmartEntrySession_resolvedProductId_idx" ON "SmartEntrySession"("resolvedProductId");
