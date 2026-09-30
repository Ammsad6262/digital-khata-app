-- Migration: cascade_fk_constraints
-- Date: 2026-09-30
--
-- Adds ON DELETE CASCADE to the remaining foreign keys that were missing it.
--
-- Without these, deleting a User fails because:
--   User → Customer (cascade) → Sale → SaleItem → Product (RESTRICT)
--   The SaleItem → Product FK blocked Product deletion, which blocked User deletion.
--
-- After this migration, deleting a User cascades through everything:
--   User → Customer, Product, Sale, Payment, StockMove, Expense, Transaction,
--   CustomerAdjustment, Setting, SaleItem (via Sale), SaleItem (via Product),
--   Payment (via Sale), Transaction (via Customer), etc.
--
-- All FK constraints are now ON DELETE CASCADE so that account deletion works
-- cleanly without leaving orphaned records.

-- SaleItem → Product (was RESTRICT, now CASCADE)
ALTER TABLE "SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_productId_fkey";
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sale → Customer (was RESTRICT, now CASCADE)
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_customerId_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment → Customer (was RESTRICT, now CASCADE)
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_customerId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment → Sale (was RESTRICT, now CASCADE)
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_saleId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CustomerAdjustment → Customer (was RESTRICT, now CASCADE)
ALTER TABLE "CustomerAdjustment" DROP CONSTRAINT IF EXISTS "CustomerAdjustment_customerId_fkey";
ALTER TABLE "CustomerAdjustment" ADD CONSTRAINT "CustomerAdjustment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- StockMove → Product (was RESTRICT, now CASCADE)
ALTER TABLE "StockMove" DROP CONSTRAINT IF EXISTS "StockMove_productId_fkey";
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SaleItem → StockMove (was SET NULL, keep as SET NULL — voiding a batch
-- shouldn't delete the SaleItem, it just removes the batch link)
-- No change needed.

-- Transaction → Customer (was RESTRICT, now CASCADE)
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_customerId_fkey";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Transaction → Product (was RESTRICT, now CASCADE)
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_productId_fkey";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Done. Deleting a User now cascades through ALL dependent records.
