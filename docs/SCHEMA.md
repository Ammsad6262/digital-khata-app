# Database Schema — Digital Khata & Wholesale Business App (V1)

> Prisma schema. SQLite for V1; the schema is Postgres-compatible for easy migration later.

---

## Design notes

1. **Money is always `Decimal(12, 2)`** — never `Float`. Prevents rounding errors.
2. **Quantities are `Decimal(10, 3)`** — wholesale often sells by weight (kg) or fractional units.
3. **Customer balance is derived** — not stored on the Customer row.
4. **Product stock is derived** — not stored on the Product row.
5. **`paidAmount` on Sale is denormalized** — a cached copy for fast display. The source of truth for "money received" is the `Payment` table.
6. **`Sale.outstanding` is denormalized** — equals `totalAmount - paidAmount`. Stored for fast filtering of "sales with remaining balance."
7. **All tables have `createdAt` and `updatedAt`** (where it makes sense) for audit.
8. **Soft delete is NOT used in V1** — deletions are blocked if there are dependent transactions; the owner uses "void" actions instead.

---

## Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL") // e.g. "file:./dev.db"
}

// ────────────────────────────────────────────────────────────────────────────
// CUSTOMER
// ────────────────────────────────────────────────────────────────────────────

model Customer {
  id        String   @id @default(cuid())
  name      String
  phone     String   @unique
  address   String?
  notes     String?
  isDeleted Boolean  @default(false) // soft-delete flag for future use
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sales    Sale[]
  payments Payment[]

  @@index([name])
  @@index([phone])
}

// ────────────────────────────────────────────────────────────────────────────
// PRODUCT
// ────────────────────────────────────────────────────────────────────────────

model Product {
  id               String   @id @default(cuid())
  name             String
  category         String?
  purchasePrice    Decimal  @db.Decimal(12, 2)
  sellingPrice     Decimal  @db.Decimal(12, 2)
  unit             String   @default("piece") // piece, kg, box, dozen, etc.
  sku              String?  @unique
  lowStockThreshold Int     @default(5)
  isDeleted        Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  saleItems SaleItem[]
  stockMoves StockMove[]

  @@index([name])
  @@index([category])
  @@index([sku])
}

// ────────────────────────────────────────────────────────────────────────────
// SALE  (one invoice/transaction)
// ────────────────────────────────────────────────────────────────────────────

model Sale {
  id          String   @id @default(cuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])

  totalAmount Decimal  @db.Decimal(12, 2) // sum of all SaleItem.total
  paidAmount  Decimal  @db.Decimal(12, 2) @default(0) // money received at sale time
  outstanding Decimal  @db.Decimal(12, 2) // totalAmount - paidAmount (denormalized)

  notes       String?
  date        DateTime @default(now()) // the date the sale happened (may be backdated)
  voidedAt    DateTime? // null = active; set when sale is voided
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  customer  Customer   @relation(fields: [customerId], references: [id])
  items     SaleItem[]
  payments  Payment[]  // payments linked specifically to this sale (optional 1:many)

  @@index([customerId])
  @@index([date])
  @@index([voidedAt])
}

// ────────────────────────────────────────────────────────────────────────────
// SALE ITEM  (one line in a sale)
// ────────────────────────────────────────────────────────────────────────────

model SaleItem {
  id        String  @id @default(cuid())
  saleId    String
  sale      Sale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  productId String
  product   Product @relation(fields: [productId], references: [id])

  quantity  Decimal @db.Decimal(10, 3)
  unitPrice Decimal @db.Decimal(12, 2) // price per unit at time of sale
  total     Decimal @db.Decimal(12, 2) // quantity * unitPrice (denormalized)

  @@index([saleId])
  @@index([productId])
}

// ────────────────────────────────────────────────────────────────────────────
// PAYMENT  (money received from a customer)
// ────────────────────────────────────────────────────────────────────────────

model Payment {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])

  saleId     String? // optional link to a specific Sale (e.g. the sale this payment was for)
  sale       Sale?    @relation(fields: [saleId], references: [id])

  amount     Decimal  @db.Decimal(12, 2)
  method     String   // "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other"
  notes      String?
  date       DateTime @default(now())
  voidedAt   DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([customerId])
  @@index([saleId])
  @@index([date])
}

// ────────────────────────────────────────────────────────────────────────────
// STOCK MOVE  (any intentional stock change by the owner)
// ────────────────────────────────────────────────────────────────────────────

model StockMove {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id])

  type      String   // "purchase" (positive) | "adjustment" (signed) | "return" (positive)
  quantity  Decimal  @db.Decimal(10, 3) // signed: + for additions, - for removals
  reason    String?
  unitCost  Decimal? @db.Decimal(12, 2) // optional purchase cost (for "purchase" type)
  date      DateTime @default(now())
  createdAt DateTime @default(now())

  @@index([productId])
  @@index([type])
  @@index([date])
}

// ────────────────────────────────────────────────────────────────────────────
// EXPENSE
// ────────────────────────────────────────────────────────────────────────────

model Expense {
  id        String   @id @default(cuid())
  name      String
  amount    Decimal  @db.Decimal(12, 2)
  category  String   // "transport" | "shop" | "electricity" | "packaging" | "salary" | "other"
  notes     String?
  date      DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([category])
  @@index([date])
}

// ────────────────────────────────────────────────────────────────────────────
// SETTING  (singleton — only one row, id = "singleton")
// ────────────────────────────────────────────────────────────────────────────

model Setting {
  id              String  @id @default("singleton") // enforced singleton
  businessName    String?
  currency        String  @default("PKR")    // ISO code
  currencySymbol  String  @default("Rs.")
  ownerPinHash    String?                     // bcrypt hash of owner's PIN
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## Derived View Helpers (SQL or service-layer functions)

These are **not** stored columns — they're computed at query time.

### Customer outstanding balance

```ts
// In lib/services/customers.ts
async function getCustomerBalance(customerId: string): Promise<Decimal> {
  const [salesTotal, paymentsTotal] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { customerId, voidedAt: null },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { customerId, voidedAt: null },
    }),
  ]);

  const sales = salesTotal._sum.totalAmount ?? new Decimal(0);
  const payments = paymentsTotal._sum.amount ?? new Decimal(0);
  return sales.minus(payments); // positive = customer owes; negative = advance/credit
}
```

### Product current stock

```ts
// In lib/services/products.ts
async function getProductStock(productId: string): Promise<Decimal> {
  const [stockIn, sold] = await Promise.all([
    prisma.stockMove.aggregate({
      _sum: { quantity: true },
      where: { productId },
    }),
    prisma.saleItem.aggregate({
      _sum: { quantity: true },
      where: {
        productId,
        sale: { voidedAt: null }, // exclude voided sales
      },
    }),
  ]);

  const inStock = stockIn._sum.quantity ?? new Decimal(0);
  const soldQty = sold._sum.quantity ?? new Decimal(0);
  return inStock.minus(soldQty);
}
```

### Dashboard aggregates

```ts
// In lib/services/dashboard.ts
async function getDashboardStats() {
  const today = startOfToday();

  const [receivables, todaysSales, todaysPayments, todaysExpenses,
         customerCount, lowStockProducts, recentTransactions] = await Promise.all([
    // Total receivables = SUM(sale.outstanding) across all customers (where voidedAt is null)
    prisma.sale.aggregate({ _sum: { outstanding: true }, where: { voidedAt: null } }),

    // Today's sales
    prisma.sale.aggregate({ _sum: { totalAmount: true }, where: { date: { gte: today } } }),

    // Today's payments
    prisma.payment.aggregate({ _sum: { amount: true }, where: { date: { gte: today } } }),

    // Today's expenses
    prisma.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: today } } }),

    // Customer count
    prisma.customer.count({ where: { isDeleted: false } }),

    // Low stock products — fetched in service layer using getProductStock() per product
    // (or batched with raw SQL for performance later)

    // Recent transactions — union of recent sales, payments, expenses (limit 10)
  ]);

  return { receivables, todaysSales, todaysPayments, todaysExpenses,
           customerCount, lowStockProducts, recentTransactions };
}
```

---

## Index Strategy

- All foreign-key columns are indexed.
- `Customer.phone` and `Product.sku` are `@unique` (and indexed).
- `Sale.date`, `Payment.date`, `Expense.date`, `StockMove.date` are indexed for date-range queries (dashboard, transaction history, summary).
- `Sale.voidedAt` is indexed so "active sales" queries are fast.

---

## Migration Plan

1. Phase 2: `prisma migrate dev --name init` — creates the initial SQLite DB.
2. Future phases: incremental migrations, never destructive (no `DROP COLUMN` without data backfill).
3. Backup tool: reads the SQLite file directly + dumps JSON of all tables for cross-engine restore.
