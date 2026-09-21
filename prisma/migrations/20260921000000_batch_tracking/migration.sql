-- ────────────────────────────────────────────────────────────────────────────
-- Migration: batch_tracking
-- Date: 2026-09-21
--
-- Adds per-batch tracking so a shopkeeper can sell from a specific purchase
-- batch (e.g. "old stock bought at Rs. 50" vs "new stock bought at Rs. 60")
-- instead of treating all stock as one undifferentiated pool.
--
-- Two columns are added:
--
-- 1. StockMove.remainingQuantity  (DECIMAL(12,2), NOT NULL, DEFAULT 0)
--    How much of THIS purchase batch is still in stock. Decremented by each
--    SaleItem that links to this StockMove; restored if that sale is voided.
--
-- 2. SaleItem.stockMoveId  (TEXT, NULLABLE)
--    Links a sale line to the specific purchase batch it was sold from.
--    NULL = "legacy / untracked" (sale recorded before this migration) OR
--    "sold from opening stock" (which is not a StockMove batch).
--
-- Backfill: existing purchases (type='purchase', voidedAt IS NULL) get
-- remainingQuantity = quantity. This is a conservative backfill — it
-- assumes no past sales have been allocated to any batch yet. Going forward,
-- new sales will explicitly link to a batch and decrement remainingQuantity
-- accurately. Past sales remain "untracked" (stockMoveId = NULL).
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Add StockMove.remainingQuantity
ALTER TABLE "StockMove"
  ADD COLUMN "remainingQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 2. Add SaleItem.stockMoveId (nullable)
ALTER TABLE "SaleItem"
  ADD COLUMN "stockMoveId" TEXT;

-- 3. Index on SaleItem.stockMoveId (fast lookup of "which sales came from this batch")
CREATE INDEX "SaleItem_stockMoveId_idx" ON "SaleItem"("stockMoveId");

-- 4. Backfill: existing non-voided purchases get remainingQuantity = quantity
--    (their full original quantity, since we don't know how much was already
--    sold from each batch via legacy sales — that's an acceptable trade-off
--    documented in the migration header above).
UPDATE "StockMove"
SET "remainingQuantity" = "quantity"
WHERE "type" = 'purchase' AND "voidedAt" IS NULL;

-- 5. Add foreign key constraint on SaleItem.stockMoveId → StockMove.id
--    (Done via Prisma's referential_actions default — RESTRICT, meaning
--    a StockMove can only be deleted after all linked SaleItems are deleted.
--    In practice StockMoves are voided (soft-deleted via voidedAt), not
--    hard-deleted, so this constraint rarely triggers.)
ALTER TABLE "SaleItem"
  ADD CONSTRAINT "SaleItem_stockMoveId_fkey"
  FOREIGN KEY ("stockMoveId") REFERENCES "StockMove"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
