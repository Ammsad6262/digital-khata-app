# Database Schema — Digital Khata & Wholesale Business App (V1)

> Phase 2 — complete data architecture. The canonical Prisma schema lives at [`prisma/schema.prisma`](../prisma/schema.prisma). This document explains the design choices, derived-calculation formulas, and atomic-transaction patterns.
>
> See also: [`DATA_ARCHITECTURE.md`](./DATA_ARCHITECTURE.md) for the entity-by-entity spec and atomic-operation walkthroughs.

---

## Design principles

1. **Money is always `Decimal(12, 2)`** — never `Float`. Prevents rounding errors in financial calculations.
2. **Quantities are `Decimal(10, 3)`** — wholesale sells by kg, box, dozen; fractional quantities are common.
3. **Customer balance is DERIVED** — never manually edited as a stored current value.
4. **Product stock is DERIVED** — never manually edited as a stored current value.
5. **`Transaction` is a denormalized unified ledger** — one row per financial movement, written in the same `prisma.$transaction` as the source-of-truth record. Powers the "Transaction History" feed with a single-table query.
6. **Multi-table mutations are wrapped in `prisma.$transaction`** — if any step fails, all roll back.
7. **Voiding is preferred over deleting** — `voidedAt` on Sale, Payment, CustomerAdjustment, StockMove, Expense. Voided records are excluded from calculations but preserved for audit.
8. **`openingBalance` / `openingStock` fields** — set ONCE at migration time from paper khata. Represents the state when the entity entered the digital system.

---

## Entities (summary)

| Entity | Purpose | Source of truth? |
|---|---|---|
| **Customer** | A buyer with their own khata | Yes — stores customer info + openingBalance |
| **Product** | A sellable item | Yes — stores product info + openingStock |
| **Sale** | One invoice (can have multiple products) | Yes — for customer balance calc |
| **SaleItem** | One line in a sale | Yes — for stock calc |
| **Payment** | Money received from a customer | Yes — for customer balance calc |
| **CustomerAdjustment** | Manual correction to a customer's balance (signed) | Yes — for customer balance calc |
| **StockMove** | Intentional stock change by owner (purchase, adjustment, return) | Yes — for stock calc |
| **Expense** | Business expense (does NOT touch customer balance) | Yes — for expense totals |
| **Transaction** | Denormalized unified ledger | Mirror — for transaction history feed |
| **Setting** | App configuration (singleton) | Yes |

---

## Derived calculations

### Customer current balance

```
balance = Customer.openingBalance
        + SUM(sale.totalAmount           WHERE sale.customerId = X AND sale.voidedAt IS NULL)
        - SUM(payment.amount             WHERE payment.customerId = X AND payment.voidedAt IS NULL)
        + SUM(adjustment.amount          WHERE adjustment.customerId = X AND adjustment.voidedAt IS NULL)
```

- **Positive balance** → customer owes the business (receivable).
- **Negative balance** → customer has paid in advance (payable / credit).
- **Zero balance** → settled.

### Product current stock

```
stock = Product.openingStock
       + SUM(stockMove.quantity    WHERE stockMove.productId = P AND stockMove.voidedAt IS NULL)
       - SUM(saleItem.quantity      WHERE saleItem.productId = P AND saleItem.sale.voidedAt IS NULL)
```

Notes:
- `stockMove.quantity` is signed: purchases and returns are positive, write-offs are negative.
- Items sold via a `Sale` live in `SaleItem`, not in `StockMove`. The formula subtracts both.
- Selling more than available stock is **allowed** in V1 (warns the owner); stock can go negative.

---

## Atomic operations

### Recording a sale (the critical multi-table operation)

A sale touches 4 tables: `Sale`, `SaleItem` (N rows), `Payment` (1 row if `paidAmount > 0`), `Transaction` (1–2 rows). All must succeed together or none at all.

Pseudocode:

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
    const totalAmount = items.reduce((s, i) => s.plus(i.total), new Decimal(0));
    const paidAmount = input.paidAmount ?? new Decimal(0);
    if (paidAmount.gt(totalAmount)) {
      throw new Error("Paid amount cannot exceed sale total");
    }
    const outstanding = totalAmount.minus(paidAmount);

    // 4. Create Sale + SaleItems (cascade relation)
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

    // 6. Write Transaction ledger rows
    await tx.transaction.create({
      data: {
        type: "sale",
        refType: "Sale",
        refId: sale.id,
        customerId: input.customerId,
        amount: totalAmount,
        direction: "debit",   // increases customer balance
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
          direction: "credit", // decreases customer balance
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

**Why this is safe:**
- All 6 steps run inside `prisma.$transaction`. If step 5 (Payment) fails, steps 1–4 are rolled back — Sale and SaleItems disappear.
- Step 7 is implicit: `SaleItem` rows ARE the stock reduction. If the transaction rolls back, SaleItems vanish and stock is unaffected.
- Voiding a sale later (separate operation) sets `voidedAt` on the Sale + linked Payment, which excludes them from balance and stock calculations — but the rows remain for audit.

### Recording a standalone payment

```ts
async function recordPayment(input: PaymentInput): Promise<Payment> {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId, isDeleted: false },
    });
    if (!customer) throw new Error("Customer not found");

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
        direction: "credit", // decreases customer balance
        date: payment.date,
      },
    });

    return payment;
  });
}
```

### Adding stock (purchase from supplier)

```ts
async function addStock(input: StockMoveInput): Promise<StockMove> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: input.productId, isDeleted: false },
    });
    if (!product) throw new Error("Product not found");

    const move = await tx.stockMove.create({
      data: {
        productId: input.productId,
        type: "purchase",
        quantity: input.quantity, // positive
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
        direction: "debit", // increases stock
        date: move.date,
      },
    });

    return move;
  });
}
```

### Recording an expense (no customer impact)

```ts
async function recordExpense(input: ExpenseInput): Promise<Expense> {
  return prisma.$transaction(async (tx) => {
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
        direction: "debit", // reduces business cash (no customer link)
        date: expense.date,
      },
    });

    return expense;
  });
}
```

> **Note:** Expense has no `customerId` — it cannot accidentally affect any customer's balance. The schema enforces this: there is no FK from Expense to Customer.

---

## Index strategy

- All foreign-key columns are indexed.
- `Customer.phone` and `Product.sku` are `@unique` (and indexed).
- All `date` columns are indexed (dashboard, transaction history, summary).
- `Sale.voidedAt`, `Payment.voidedAt`, `CustomerAdjustment.voidedAt`, `StockMove.voidedAt`, `Expense.voidedAt` are indexed for fast "active records" queries.
- `Transaction` has indexes on `type`, `customerId`, `productId`, `date`, and `(refType, refId)` for fast reverse-lookups.

---

## Migration plan

1. **Phase 3 (next):** `prisma migrate dev --name init` to create the initial SQLite database from this schema.
2. Future phases use incremental migrations — never destructive (`DROP COLUMN`/`DROP TABLE` requires explicit data backfill).
3. Backup tool reads the SQLite file + dumps JSON of all tables for cross-engine restore.

---

## V2 hooks (kept open in V1 schema)

| Field | Purpose | Used in V1? |
|---|---|---|
| `Customer.isDeleted` / `Product.isDeleted` | Soft-delete | Stored now; UI in V2 |
| `Sale.voidedAt` / `Payment.voidedAt` etc. | Void (audit-friendly delete) | Yes, used in V1 |
| `StockMove.unitCost` | Future profit reports | Stored now; reports in V2 |
| `Payment.saleId` | Link payment to specific invoice | Optional in V1; required for invoicing in V2 |
| `Setting.timezone` | Per-business TZ | Default `Asia/Karachi` in V1 |
| All tables ready for `businessId` column | Multi-business | Additive column in V2 |
