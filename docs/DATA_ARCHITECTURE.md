# Data Architecture — Digital Khata & Wholesale Business App (V1)

> Phase 2 deliverable. Defines every entity, its fields, relationships, and the formulas that keep balances and stock consistent. The canonical Prisma schema is [`prisma/schema.prisma`](../prisma/schema.prisma); this document is the design rationale.

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Entity definitions](#2-entity-definitions)
   - [2.1 Customer](#21-customer)
   - [2.2 Product](#22-product)
   - [2.3 Sale](#23-sale)
   - [2.4 SaleItem](#24-saleitem)
   - [2.5 Payment](#25-payment)
   - [2.6 CustomerAdjustment](#26-customeradjustment)
   - [2.7 StockMove](#27-stockmove)
   - [2.8 Expense](#28-expense)
   - [2.9 Transaction (ledger)](#29-transaction-ledger)
   - [2.10 Setting](#210-setting)
3. [Derived calculations](#3-derived-calculations)
   - [3.1 Customer balance](#31-customer-balance)
   - [3.2 Product stock](#32-product-stock)
4. [Atomic operations](#4-atomic-operations)
   - [4.1 Recording a sale](#41-recording-a-sale)
   - [4.2 Recording a payment](#42-recording-a-payment)
   - [4.3 Adding stock](#43-adding-stock)
   - [4.4 Recording an expense](#44-recording-an-expense)
   - [4.5 Voiding a sale](#45-voiding-a-sale)
5. [Why the Transaction ledger exists](#5-why-the-transaction-ledger-exists)
6. [Why opening balances exist](#6-why-opening-balances-exist)
7. [Data integrity guarantees](#7-data-integrity-guarantees)

---

## 1. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     SOURCE OF TRUTH (specialized tables)              │
│                                                                       │
│   Customer       Product        Sale       SaleItem      Payment     │
│       │             │            │           │             │         │
│       │             │            │           │             │         │
│       └──adjustment─┘            └───────────┘             │         │
│           │                      │                         │         │
│   CustomerAdjustment       StockMove                      │         │
│                                  │                         │         │
│                              Expense                       │         │
└──────────────────────────────────│─────────────────────────┘────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│              DENORMALIZED MIRROR (Transaction ledger)                │
│                                                                       │
│   Transaction (one row per financial movement — written in the       │
│   same prisma.$transaction as the source record above)              │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│              DERIVED VIEWS (computed at query time)                  │
│                                                                       │
│   Customer balance = opening + sales - payments + adjustments        │
│   Product stock    = opening + stockMoves - saleItems                │
│   Dashboard stats  = aggregates over specialized tables              │
└──────────────────────────────────────────────────────────────────────┘
```

**Key idea:** The specialized tables (Sale, Payment, StockMove, etc.) are the **source of truth**. The customer balance and product stock are **computed** from them — never stored as the canonical value. The `Transaction` table is a **denormalized mirror** that makes the unified "Transaction History" feed a single-table query.

---

## 2. Entity definitions

### 2.1 Customer

A buyer with their own digital khata.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto-generated | Primary key |
| `name` | String | yes | — | Customer name |
| `phone` | String | yes | — | Unique, indexed — primary search key |
| `address` | String | no | null | Optional location |
| `notes` | String | no | null | Free-form notes |
| `openingBalance` | Decimal(12,2) | yes | 0 | Set ONCE at migration from paper khata |
| `isDeleted` | Boolean | yes | false | Soft-delete flag (UI in V2) |
| `createdAt` | DateTime | yes | now() | |
| `updatedAt` | DateTime | yes | auto | |

**Relationships:**
- `1 Customer → N Sale` (cascade: block delete if sales exist in V1)
- `1 Customer → N Payment`
- `1 Customer → N CustomerAdjustment`
- `1 Customer → N Transaction` (optional link from ledger)

**Why `openingBalance`?** When the owner migrates a customer from paper khata, the customer already owes money. Rather than fabricating a fake "sale" to represent that historical debt, we store it as `openingBalance`. The balance formula adds it in.

---

### 2.2 Product

A sellable item with its own stock tracking.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto | |
| `name` | String | yes | — | |
| `category` | String | no | null | For grouping/filtering |
| `purchasePrice` | Decimal(12,2) | yes | — | Cost price (for V2 profit reports) |
| `sellingPrice` | Decimal(12,2) | yes | — | Default selling price |
| `unit` | String | yes | `"piece"` | piece / kg / box / dozen |
| `sku` | String | no | null | Unique if provided |
| `openingStock` | Decimal(10,3) | yes | 0 | Set ONCE at migration from paper register |
| `lowStockThreshold` | Int | yes | 5 | Warns the owner when stock ≤ threshold |
| `isDeleted` | Boolean | yes | false | |
| `createdAt` | DateTime | yes | now() | |
| `updatedAt` | DateTime | yes | auto | |

**Relationships:**
- `1 Product → N SaleItem`
- `1 Product → N StockMove`
- `1 Product → N Transaction` (optional link from ledger)

**Why `openingStock`?** Same logic as customer opening balance — when migrating from a paper register, the owner already has X units of this product in the shop. We store that as `openingStock` rather than fabricating a fake "purchase" StockMove.

---

### 2.3 Sale

One invoice/transaction — can contain multiple products via SaleItems.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto | |
| `customerId` | String (FK) | yes | — | |
| `totalAmount` | Decimal(12,2) | yes | — | Sum of all SaleItem.total |
| `paidAmount` | Decimal(12,2) | yes | 0 | Money received at sale time |
| `outstanding` | Decimal(12,2) | yes | — | `totalAmount - paidAmount` (denormalized) |
| `notes` | String | no | null | |
| `date` | DateTime | yes | now() | Can be backdated |
| `voidedAt` | DateTime | no | null | Set when sale is voided |
| `createdAt` | DateTime | yes | now() | |
| `updatedAt` | DateTime | yes | auto | |

**Relationships:**
- `N Sale → 1 Customer`
- `1 Sale → N SaleItem` (cascade delete if sale deleted — but V1 uses void instead)
- `1 Sale → N Payment` (payments explicitly linked to this sale — optional)

**Why denormalize `outstanding`?** Fast filtering of "sales with remaining balance" without recomputing from SaleItems + Payments. The source of truth for "how much has been paid in total" is the `Payment` table.

---

### 2.4 SaleItem

One line in a sale. Implements the **Sale → SaleItems one-to-many** relationship.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto | |
| `saleId` | String (FK) | yes | — | |
| `productId` | String (FK) | yes | — | |
| `quantity` | Decimal(10,3) | yes | — | Units sold |
| `unitPrice` | Decimal(12,2) | yes | — | Price per unit at time of sale (snapshot) |
| `total` | Decimal(12,2) | yes | — | `quantity * unitPrice` (denormalized) |

**Relationships:**
- `N SaleItem → 1 Sale` (onDelete: Cascade — if sale is deleted, items go too)
- `N SaleItem → 1 Product`

**Why store `unitPrice` on the SaleItem?** Product.sellingPrice can change over time. The SaleItem captures the price **at the moment of the sale** so historical sales always show what was actually charged.

**Why are SaleItems the stock-decrement source?** We don't create a StockMove for "items sold via sale" — the SaleItem rows ARE the decrement. This means:
- Voiding a sale automatically restores stock (SaleItems excluded from `SUM` when `sale.voidedAt` is set).
- No need to keep SaleItems and StockMoves in sync — they're separate concerns.

---

### 2.5 Payment

Money received from a customer. Decreases their balance.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto | |
| `customerId` | String (FK) | yes | — | |
| `saleId` | String (FK) | no | null | Optional link to specific sale |
| `amount` | Decimal(12,2) | yes | — | Always positive |
| `method` | String | yes | — | `cash` / `bank` / `cheque` / `jazzcash` / `easypaisa` / `other` |
| `notes` | String | no | null | |
| `date` | DateTime | yes | now() | |
| `voidedAt` | DateTime | no | null | |
| `createdAt` | DateTime | yes | now() | |
| `updatedAt` | DateTime | yes | auto | |

**Relationships:**
- `N Payment → 1 Customer`
- `N Payment → 0..1 Sale` (optional — payments can be customer-level, not sale-level)

**Why is `saleId` optional?** A customer often makes a lump-sum payment against their overall khata, not against a specific invoice. Forcing `saleId` would make the payment flow awkward. V1 keeps it optional.

**Why `method` is a string (not an enum)?** SQLite doesn't enforce enums at the DB level. Validation is done in the Zod schema. Adding a new method later is a one-line code change, no migration.

---

### 2.6 CustomerAdjustment

A manual correction to a customer's balance. Signed amount.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto | |
| `customerId` | String (FK) | yes | — | |
| `amount` | Decimal(12,2) | yes | — | **Signed**: + increases balance (customer owes more), − decreases |
| `reason` | String | yes | — | Required — owner must explain why |
| `notes` | String | no | null | |
| `date` | DateTime | yes | now() | |
| `voidedAt` | DateTime | no | null | |
| `createdAt` | DateTime | yes | now() | |
| `updatedAt` | DateTime | yes | auto | |

**Relationships:**
- `N CustomerAdjustment → 1 Customer`

**Use cases:**
- Migrating from paper khata and realizing the opening balance was wrong → adjustment to fix.
- Writing off bad debt as uncollectable → negative adjustment.
- Correcting a data entry error after the original sale was already voided → adjustment to undo the impact.

**Why `reason` is required?** Adjustments are dangerous — they directly change a customer's balance without a backing transaction. Forcing a reason creates a paper trail.

---

### 2.7 StockMove

Any intentional stock change made by the owner (not via a sale).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto | |
| `productId` | String (FK) | yes | — | |
| `type` | String | yes | — | `purchase` / `adjustment` / `return` |
| `quantity` | Decimal(10,3) | yes | — | **Signed**: + adds, − removes (for adjustment type) |
| `reason` | String | no | null | |
| `unitCost` | Decimal(12,2) | no | null | Optional purchase cost (for V2 profit reports) |
| `date` | DateTime | yes | now() | |
| `voidedAt` | DateTime | no | null | |
| `createdAt` | DateTime | yes | now() | |

**Relationships:**
- `N StockMove → 1 Product`

**Type semantics:**
| `type` | Sign of `quantity` | Effect on stock |
|---|---|---|
| `purchase` | positive | +stock (bought from supplier) |
| `return` | positive | +stock (customer returned goods) |
| `adjustment` | signed | ±stock (recount, write-off, correction) |

**Why no `sale` type?** Stock sold via a Sale is tracked in `SaleItem`, not in StockMove. Keeping these separate means voiding a sale automatically restores stock without needing to also void a corresponding StockMove.

---

### 2.8 Expense

A business expense. **Does NOT affect any customer's balance.**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto | |
| `name` | String | yes | — | E.g. "Diesel for delivery van" |
| `amount` | Decimal(12,2) | yes | — | Always positive |
| `category` | String | yes | — | `transport` / `shop` / `electricity` / `packaging` / `salary` / `rent` / `other` |
| `notes` | String | no | null | |
| `date` | DateTime | yes | now() | |
| `voidedAt` | DateTime | no | null | |
| `createdAt` | DateTime | yes | now() | |
| `updatedAt` | DateTime | yes | auto | |

**Relationships:** None — independent entity.

**How we prevent expenses from affecting customer balance:** Schema-level. There is **no FK from Expense to Customer**. A developer cannot accidentally write code that subtracts an expense from a customer's balance because there's no relationship to traverse.

---

### 2.9 Transaction (ledger)

A denormalized unified ledger — one row per financial movement.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String (cuid) | yes | auto | |
| `type` | String | yes | — | `sale` / `payment` / `expense` / `stock_move` / `balance_adjustment` |
| `refType` | String | yes | — | `Sale` / `Payment` / `Expense` / `StockMove` / `CustomerAdjustment` |
| `refId` | String | yes | — | ID of the source record |
| `customerId` | String (FK) | no | null | Set if transaction involves a customer |
| `productId` | String (FK) | no | null | Set if transaction involves a product |
| `amount` | Decimal(12,2) | yes | — | Always positive; `direction` gives the sign |
| `direction` | String | yes | — | `debit` / `credit` (semantic, see below) |
| `date` | DateTime | yes | now() | |
| `notes` | String | no | null | |
| `createdAt` | DateTime | yes | now() | |

**Direction semantics per type:**

| `type` | `direction` | Effect |
|---|---|---|
| `sale` | `debit` | Customer balance ↑ (they owe more) |
| `payment` | `credit` | Customer balance ↓ (they paid) |
| `balance_adjustment` | `debit` or `credit` | Signed effect on customer balance |
| `expense` | `debit` | Business cash ↓ (no customer link) |
| `stock_move` | `debit` | Stock ↑ (purchase/return/positive adjustment) |
| `stock_move` | `credit` | Stock ↓ (negative adjustment) |

**Relationships:**
- `N Transaction → 0..1 Customer`
- `N Transaction → 0..1 Product`

**Why this table exists at all?** Without it, the "Transaction History" screen would require a `UNION ALL` across 5 tables (Sale, Payment, CustomerAdjustment, StockMove, Expense) — slow at scale, hard to filter, hard to paginate. With this table, the feed is a single `SELECT * FROM Transaction ORDER BY date DESC LIMIT 50`.

**The source of truth is still the specialized tables.** The `Transaction` table is a mirror — written in the same `prisma.$transaction` as the source record. If they ever diverge (a bug), the specialized tables win.

---

### 2.10 Setting

App configuration. Singleton — only one row, `id = "singleton"`.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | String | yes | `"singleton"` | Enforced singleton |
| `businessName` | String | no | null | |
| `currency` | String | yes | `"PKR"` | ISO 4217 |
| `currencySymbol` | String | yes | `"Rs."` | Display symbol |
| `ownerPinHash` | String | no | null | bcrypt hash of owner's PIN |
| `timezone` | String | yes | `"Asia/Karachi"` | For "today" calculations |
| `createdAt` | DateTime | yes | now() | |
| `updatedAt` | DateTime | yes | auto | |

---

## 3. Derived calculations

### 3.1 Customer balance

```
balance = Customer.openingBalance
        + SUM(sale.totalAmount           WHERE sale.customerId = X AND sale.voidedAt IS NULL)
        - SUM(payment.amount             WHERE payment.customerId = X AND payment.voidedAt IS NULL)
        + SUM(adjustment.amount          WHERE adjustment.customerId = X AND adjustment.voidedAt IS NULL)
```

| Balance value | Meaning |
|---|---|
| Positive | Customer owes the business (receivable) |
| Negative | Customer paid in advance (payable / credit) |
| Zero | Settled |

**Implementation** (in `lib/services/customers.ts` — to be written in a later phase):

```ts
async function getCustomerBalance(customerId: string): Promise<Decimal> {
  const [customer, salesAgg, paymentsAgg, adjustmentsAgg] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { customerId, voidedAt: null },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { customerId, voidedAt: null },
    }),
    prisma.customerAdjustment.aggregate({
      _sum: { amount: true },
      where: { customerId, voidedAt: null },
    }),
  ]);

  const sales = salesAgg._sum.totalAmount ?? new Decimal(0);
  const payments = paymentsAgg._sum.amount ?? new Decimal(0);
  const adjustments = adjustmentsAgg._sum.amount ?? new Decimal(0);

  return customer.openingBalance
    .plus(sales)
    .minus(payments)
    .plus(adjustments);
}
```

### 3.2 Product stock

```
stock = Product.openingStock
       + SUM(stockMove.quantity    WHERE stockMove.productId = P AND stockMove.voidedAt IS NULL)
       - SUM(saleItem.quantity      WHERE saleItem.productId = P AND saleItem.sale.voidedAt IS NULL)
```

**Implementation** (in `lib/services/products.ts` — to be written in a later phase):

```ts
async function getProductStock(productId: string): Promise<Decimal> {
  const [product, movesAgg, itemsAgg] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    prisma.stockMove.aggregate({
      _sum: { quantity: true },
      where: { productId, voidedAt: null },
    }),
    prisma.saleItem.aggregate({
      _sum: { quantity: true },
      where: {
        productId,
        sale: { voidedAt: null }, // exclude items from voided sales
      },
    }),
  ]);

  const moves = movesAgg._sum.quantity ?? new Decimal(0);
  const sold = itemsAgg._sum.quantity ?? new Decimal(0);

  return product.openingStock.plus(moves).minus(sold);
}
```

**Performance note:** For the stock overview screen (all products at once), calling `getProductStock()` per product would be N+1. Use a single raw SQL query with `GROUP BY productId` instead. Implementation deferred to the relevant phase.

---

## 4. Atomic operations

All multi-table mutations are wrapped in `prisma.$transaction(async (tx) => { ... })`. If any step throws, the entire transaction rolls back — partial state is impossible.

### 4.1 Recording a sale

A sale touches up to 4 tables. All-or-nothing.

```ts
async function createSale(input: CreateSaleInput): Promise<Sale> {
  return prisma.$transaction(async (tx) => {
    // 1. Validate customer exists
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId, isDeleted: false },
    });
    if (!customer) throw new Error("Customer not found");

    // 2. Validate all products exist
    const productIds = input.items.map(i => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, isDeleted: false },
    });
    if (products.length !== productIds.length) {
      throw new Error("One or more products not found");
    }

    // 3. Compute totals
    const items = input.items.map(i => ({
      ...i,
      total: i.quantity.mul(i.unitPrice),
    }));
    const totalAmount = items.reduce(
      (s, i) => s.plus(i.total),
      new Decimal(0),
    );
    const paidAmount = input.paidAmount ?? new Decimal(0);
    if (paidAmount.gt(totalAmount)) {
      throw new Error("Paid amount cannot exceed sale total");
    }
    const outstanding = totalAmount.minus(paidAmount);

    // 4. Create Sale + SaleItems (nested write)
    const sale = await tx.sale.create({
      data: {
        customerId: input.customerId,
        totalAmount,
        paidAmount,
        outstanding,
        notes: input.notes,
        date: input.date ?? new Date(),
        items: {
          create: items.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
          })),
        },
      },
      include: { items: true },
    });

    // 5. If money was paid at sale time, create a linked Payment
    let paymentId: string | null = null;
    if (paidAmount.gt(0)) {
      const payment = await tx.payment.create({
        data: {
          customerId: input.customerId,
          saleId: sale.id,
          amount: paidAmount,
          method: input.paymentMethod ?? "cash",
          date: sale.date,
        },
      });
      paymentId = payment.id;
    }

    // 6. Write Transaction ledger rows (denormalized mirror)
    await tx.transaction.create({
      data: {
        type: "sale",
        refType: "Sale",
        refId: sale.id,
        customerId: input.customerId,
        amount: totalAmount,
        direction: "debit",
        date: sale.date,
        notes: `Sale ${sale.id}`,
      },
    });

    if (paymentId) {
      await tx.transaction.create({
        data: {
          type: "payment",
          refType: "Payment",
          refId: paymentId,
          customerId: input.customerId,
          amount: paidAmount,
          direction: "credit",
          date: sale.date,
        },
      });
    }

    // 7. NOTE: Stock is automatically reduced because SaleItem rows exist.
    //    getProductStock() subtracts SUM(saleItem.quantity). No StockMove needed.

    return sale;
  });
}
```

**Failure scenarios that the transaction handles:**

| Failure point | What rolls back |
|---|---|
| Step 4 (SaleItem.create) fails | Sale row, all SaleItem rows — DB clean |
| Step 5 (Payment.create) fails | Sale, all SaleItems — DB clean |
| Step 6 (Transaction.create) fails | Sale, SaleItems, Payment — DB clean |
| Network drop mid-transaction | Prisma aborts the underlying SQLite transaction |

**Why step 7 needs no code:** Stock reduction is implicit. The `SaleItem` rows ARE the stock reduction. The `getProductStock()` formula subtracts `SUM(saleItem.quantity)`. If the transaction rolls back, SaleItems vanish → stock is unaffected. No separate StockMove row to keep in sync.

### 4.2 Recording a payment

```ts
async function recordPayment(input: PaymentInput): Promise<Payment> {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId, isDeleted: false },
    });
    if (!customer) throw new Error("Customer not found");

    if (input.amount.lte(0)) {
      throw new Error("Payment amount must be positive");
    }

    const payment = await tx.payment.create({
      data: {
        customerId: input.customerId,
        saleId: input.saleId ?? null,
        amount: input.amount,
        method: input.method,
        notes: input.notes,
        date: input.date ?? new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        type: "payment",
        refType: "Payment",
        refId: payment.id,
        customerId: input.customerId,
        amount: input.amount,
        direction: "credit",
        date: payment.date,
      },
    });

    return payment;
  });
}
```

### 4.3 Adding stock

```ts
async function addStock(input: StockMoveInput): Promise<StockMove> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: input.productId, isDeleted: false },
    });
    if (!product) throw new Error("Product not found");

    if (input.quantity.lte(0)) {
      throw new Error("Stock purchase quantity must be positive");
    }

    const move = await tx.stockMove.create({
      data: {
        productId: input.productId,
        type: "purchase",
        quantity: input.quantity,
        unitCost: input.unitCost,
        reason: input.reason,
        date: input.date ?? new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        type: "stock_move",
        refType: "StockMove",
        refId: move.id,
        productId: input.productId,
        amount: input.unitCost
          ? input.unitCost.mul(input.quantity)
          : new Decimal(0),
        direction: "debit",
        date: move.date,
      },
    });

    return move;
  });
}
```

### 4.4 Recording an expense

```ts
async function recordExpense(input: ExpenseInput): Promise<Expense> {
  return prisma.$transaction(async (tx) => {
    if (input.amount.lte(0)) {
      throw new Error("Expense amount must be positive");
    }

    const expense = await tx.expense.create({
      data: {
        name: input.name,
        amount: input.amount,
        category: input.category,
        notes: input.notes,
        date: input.date ?? new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        type: "expense",
        refType: "Expense",
        refId: expense.id,
        amount: input.amount,
        direction: "debit",
        date: expense.date,
      },
    });

    return expense;
  });
}
```

> **Note:** The Expense transaction has no `customerId` — it cannot affect any customer's balance. This is enforced at the schema level (no FK from Expense to Customer).

### 4.5 Voiding a sale

Voiding is the audit-friendly alternative to deletion. The sale remains in the DB but is excluded from calculations.

```ts
async function voidSale(saleId: string): Promise<Sale> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { payments: true },
    });

    if (sale.voidedAt) {
      throw new Error("Sale is already voided");
    }

    // Mark the sale as voided
    const updated = await tx.sale.update({
      where: { id: saleId },
      data: { voidedAt: new Date() },
    });

    // Void any payments linked to this sale as well
    // (They were created as part of the sale's paidAmount — voiding the sale
    //  should also reverse those.)
    if (sale.payments.length > 0) {
      await tx.payment.updateMany({
        where: { saleId, voidedAt: null },
        data: { voidedAt: new Date() },
      });
    }

    // Mark the corresponding Transaction ledger rows as voided too.
    // (We don't delete them — same audit principle.)
    // Implementation: add a voidedAt column to Transaction in V2 if needed,
    // OR filter by joining back to the source table. For V1 we filter
    // Transaction rows by checking if the source record is voided.

    return updated;
  });
}
```

After voiding:
- The sale is excluded from `SUM(sale.totalAmount)` in the balance formula → customer balance drops by `totalAmount`.
- The linked payments are excluded from `SUM(payment.amount)` → customer balance rises by `paidAmount`.
- Net effect on customer balance: `paidAmount - totalAmount` (typically negative — customer's balance goes down because the sale is removed but they may have already paid).

**UI warning:** When voiding a sale that had payments, the UI should warn: *"This sale had Rs. X in payments recorded against it. Voiding will reverse those payments too, increasing the customer's balance by Rs. X. Are you sure?"*

---

## 5. Why the Transaction ledger exists

**Without it:** The "Transaction History" screen requires a UNION ALL across 5 tables. Each table has different columns. Filtering by date range, type, customer, or product requires 5 separate queries. Pagination across a union is painful.

**With it:** One table, one query, trivial filtering and pagination.

| Approach | Query complexity | Maintenance |
|---|---|---|
| UNION ALL of 5 tables | High — different columns, different filters | Hard — change a column, update 5 queries |
| Denormalized `Transaction` table | Low — `SELECT * FROM Transaction WHERE ...` | Easy — change a column, update the writer |

**Cost:** One extra row written per financial movement. Worth it.

**Risk:** The Transaction table could drift out of sync with the source tables if a developer forgets to write the Transaction row. Mitigated by:
- All writes go through `lib/services/*.ts` — never direct `prisma.sale.create()` from route handlers.
- The service layer writes both in the same `prisma.$transaction`.
- A future reconciliation script can check `COUNT(Sale) == COUNT(Transaction WHERE type='sale')` and alert.

---

## 6. Why opening balances exist

When migrating from paper khata, the customer already owes Rs. X. We have two options:

**Option A — Fabricate a historical Sale:** Create a Sale dated "before go-live" with `totalAmount = X`, `paidAmount = 0`, `outstanding = X`. This works but pollutes the sale history with fake invoices.

**Option B — Store an `openingBalance` field:** Set `Customer.openingBalance = X` at creation time. The balance formula adds it in. No fake sales.

We chose **Option B** because it's cleaner. Same logic applies to `Product.openingStock`.

**Rule:** `openingBalance` and `openingStock` are set **once** when the entity is created. They are never updated after creation. If the owner realizes the opening was wrong, they create a `CustomerAdjustment` (which is audited) rather than silently changing the opening.

---

## 7. Data integrity guarantees

| Guarantee | How it's enforced |
|---|---|
| Customer balance cannot be manually edited | No `currentBalance` column exists; balance is computed from transactions |
| Product stock cannot be manually edited | No `currentStock` column exists; stock is computed from movements and sale items |
| Sale + SaleItems + Payment are atomic | `prisma.$transaction` wraps all three writes |
| Stock reduction on sale is atomic with the sale | SaleItem rows are part of the same transaction — if the sale rolls back, stock isn't reduced |
| Expenses cannot affect customer balance | No FK from Expense to Customer; balance formula doesn't include Expense |
| Voided records stay in DB for audit | `voidedAt` column; calculations filter `WHERE voidedAt IS NULL` |
| Money never stored as float | `Decimal(12,2)` everywhere |
| Quantities never stored as float | `Decimal(10,3)` everywhere |
| Customer phone is unique | `@unique` constraint |
| Product SKU is unique (if provided) | `@unique` constraint |
| Soft-deleted entities are excluded | `isDeleted = false` filter in all queries |
| All financial movements are audited | `Transaction` ledger row written in the same transaction as the source record |
| Adjustments require a reason | `reason` field is required (Zod validation) |

---

## Phase 2 deliverable checklist

- [x] `prisma/schema.prisma` — full Prisma schema with all 10 entities
- [x] `docs/SCHEMA.md` — updated to reflect Phase 2 design
- [x] `docs/DATA_ARCHITECTURE.md` — this document (entity defs, formulas, atomic operations)
- [ ] Commit + push to GitHub

**Phase 2 explicitly does NOT include:** UI components, API routes, service-layer implementation files (the code samples in this document are illustrative; actual `lib/services/*.ts` files come in a later phase), Prisma migration (run when we scaffold the app).
