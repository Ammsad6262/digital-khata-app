# Architecture — Digital Khata & Wholesale Business App (V1)

> Phase 1 proposal. No application code has been written yet. This document exists so we agree on the foundations before Phase 2.

---

## 1. Design Principles

1. **Mobile-first, phone-friendly UI** — large tap targets, minimal typing, fast transaction entry.
2. **Single business, single owner** — no multi-tenant complexity in V1.
3. **Derived data, not stored data** — customer balance and product stock are *computed* from transaction history whenever possible, never manually edited.
4. **Audit-friendly** — every money movement and stock movement is a row in a transactional table; nothing gets silently overwritten.
5. **Offline-tolerant mindset** — UI should feel instant even on a slow connection; optimistic updates where safe.
6. **Pragmatic, not over-engineered** — no microservices, no event sourcing, no CQRS. One Next.js app, one database file.
7. **Easily extensible** — schema and folder structure leave room for V2 features (multi-business, online payments, receipts) without rewriting.

---

## 2. Tech Stack (Proposed)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | Single codebase for UI + API, server components, easy deploy (Vercel / self-host) |
| Language | **TypeScript (strict)** | Catch bugs early, easier refactor in later phases |
| UI | **Tailwind CSS + shadcn/ui** | Mobile-first utility CSS, accessible components, easy theming |
| Forms | **React Hook Form + Zod** | Fast, schema-validated forms; reuse Zod schemas on the server |
| Database | **SQLite (via Prisma)** | Single-file DB, zero-ops, easy backup (copy the file), perfect for one-business V1. Migration to PostgreSQL is a one-line `DATABASE_URL` change later |
| ORM | **Prisma** | Type-safe queries, migrations, schema as source of truth |
| Server state | **TanStack Query (React Query v5)** | Caching, invalidation, optimistic updates |
| Client state | **Zustand** (minimal) | Small UI state (drawer open/close, filters) — keep server state in React Query |
| Auth | **Local PIN only** (V1) | No customer login; just a PIN to lock the owner's device |
| Export | **PapaParse (CSV) + SheetJS (XLSX)** | CSV for portability, XLSX for owner-friendly Excel files |
| Validation | **Zod** | Shared between client and server |
| Testing | **Vitest + Playwright** (later) | Unit + e2e; not in Phase 1 scope |
| Deployment | **Vercel** or self-hosted on a single VPS | V1 doesn't need scale |

> **Why SQLite for V1?** The owner runs one small wholesale business. SQLite is one file, trivially backed up, fast, and needs zero DBA. When the business grows or we go multi-business, switching the Prisma `DATABASE_URL` to Postgres is the only change needed.

---

## 3. Application Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile Browser / PWA                 │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│  Next.js App Router (React Server Components + Client)  │
│  - app/dashboard, app/khata, app/sales, app/stock, app/more
│  - shadcn/ui components, Tailwind                       │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│         Route Handlers (app/api/...) — thin layer       │
│  - Validates input with Zod                              │
│  - Delegates to service modules                          │
│  - Returns JSON                                          │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│              Service Layer (lib/services/*)              │
│  - Business logic: createSale, recordPayment,            │
│    addStock, computeBalance, computeStock                │
│  - Wraps multiple Prisma operations in transactions      │
│  - Single source of truth for "how a sale is recorded"   │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│              Prisma (lib/db/prisma.ts)                   │
│  - Type-safe queries, migrations                         │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│              SQLite (single .db file)                     │
└─────────────────────────────────────────────────────────┘
```

**Why a service layer?** A sale touches 4 tables (Sale, SaleItem, Payment, StockMove). If we put that logic inside route handlers, every new endpoint will duplicate it. If we put it inside React components, we can't reuse it from API routes / server actions / future CLI. A service module (`lib/services/sales.ts`) is the single place where "recording a sale" is defined.

---

## 4. Main Entities and Relationships

```
Customer 1 ──── * Sale * ──── * SaleItem * ──── 1 Product
   │                  │                            │
   │                  │                            │
   └──── * Payment    │                       * StockMove ──── 1 Product
                       │
                       └──── (optional link to specific Sale)

Expense (independent)

Setting (singleton row — business name, currency, PIN hash)
```

### Entity summary

| Entity | Purpose | Key fields |
|---|---|---|
| **Customer** | A buyer with their own khata | name, phone (unique), address?, notes? |
| **Product** | A sellable item | name, category?, purchasePrice, sellingPrice, unit, sku?, lowStockThreshold |
| **Sale** | One invoice/transaction | customerId, totalAmount, paidAmount, outstanding, date, notes? |
| **SaleItem** | One line in a sale | saleId, productId, quantity, unitPrice, total |
| **Payment** | Money received from a customer | customerId, saleId? (optional link), amount, method, date, notes? |
| **StockMove** | Any stock change (purchase, adjustment, etc.) | productId, type, quantity (signed), reason?, unitCost?, date |
| **Expense** | A business expense | name, amount, category, date, notes? |
| **Setting** | App config (singleton) | businessName, currency, currencySymbol, ownerPinHash |

> See [`SCHEMA.md`](./SCHEMA.md) for the full Prisma schema.

---

## 5. How Customer Balances Are Calculated

**Formula:**

```
Customer.outstandingBalance =
    SUM(sale.totalAmount WHERE sale.customerId = X)
  - SUM(payment.amount  WHERE payment.customerId = X)
```

### How it stays correct automatically

- When a sale is created with `paidAmount = P`:
  1. Sale row inserted with `totalAmount = T`, `paidAmount = P`, `outstanding = T - P`.
  2. If `P > 0`, a Payment row is **also** inserted (type `sale_payment`, linked to that sale) so all money received lives in one table.
  3. StockMove rows are inserted (type `sale`, quantity negative) for each SaleItem.
- When a payment is recorded against a customer:
  1. Payment row inserted with amount + method.
  2. Customer's balance automatically drops because it's derived from `SUM(sale.totalAmount) - SUM(payment.amount)`.

### Why we keep `paidAmount` on the Sale too

- For quick display: "Sale of Rs. 100,000, paid Rs. 40,000 on the spot, remaining Rs. 60,000."
- The Sale's `outstanding` field is denormalized for display speed; the **source of truth** for "how much has the customer paid in total" is the `Payment` table.

### Negative balance (customer credit)

- Allowed. If a customer pays more than they owe, balance goes negative — meaning the business owes them. Displayed as "Advance payment: Rs. X".

---

## 6. How Product Stock Is Calculated

**Formula:**

```
Product.currentStock =
    SUM(stockMove.quantity WHERE stockMove.productId = P AND type IN ('purchase', 'adjustment'))
  - SUM(saleItem.quantity  WHERE saleItem.productId = P)
```

### Why two separate sources?

- **StockMove** captures *intentional* stock additions / adjustments by the owner (buying from supplier, write-offs, recounts).
- **SaleItem** captures *automatic* stock decreases when a sale is recorded.

Keeping them separate means:
- Deleting a sale automatically restores stock (the SaleItem rows are gone).
- Adjusting stock doesn't pollute the sale history.

### Low stock warning

- `Product.lowStockThreshold` (default 5) — when `currentStock <= threshold`, the UI flags the product on Dashboard + Stock screen.

### Selling more than available stock

- V1: **warn but allow**. The owner might be selling from incoming stock that hasn't been formally added yet. Don't block their workflow.

---

## 7. Edge Cases & Decisions

See [`EDGE_CASES.md`](./EDGE_CASES.md) for the full list. Key ones:

| Edge case | Decision |
|---|---|
| Deleting a sale with linked payments | **Block** deletion in V1. Provide a "void" action that creates reversing entries. |
| Editing a sale after creation | Allowed in V1; recomputes balances. |
| Payment > outstanding | Allowed; creates a negative balance (advance payment). |
| Selling more than available stock | Warn but allow. |
| Money precision | `Decimal(12, 2)` everywhere — never use `float`. |
| Customer with duplicate phone | Block — phone is `@unique`. |
| Deleting a customer with transactions | Block — require soft delete or no deletion. |
| Backup format | JSON for full restore, CSV/XLSX for export. |
| Timezones | Store UTC, display in user's TZ. |
| Currency | Single currency in V1, set in Settings. |

---

## 8. Performance & Caching Strategy

- **React Query** with sensible `staleTime` (e.g. 30s for dashboard) — feels instant while staying fresh.
- **Optimistic updates** for sale / payment / stock creation — UI updates immediately, rolls back if the server errors.
- **Server Components** for read-only screens (e.g. customer khata view) — render on server, send HTML.
- **Indexed DB / Service Worker** (V2, not V1) — true offline support.

---

## 9. Security (V1 — single owner)

- Local PIN gate (hashed with bcrypt, stored in `Setting.ownerPinHash`).
- All API routes require PIN unlock (session cookie).
- No customer login, no roles, no permissions.
- Input validation via Zod on **every** API route.
- SQL injection: impossible — Prisma parameterizes all queries.
- CSRF: Next.js built-in CSRF tokens on mutations.

---

## 10. Extensibility (V2 hooks we keep open)

The schema is designed so the following V2 features can be added without restructuring:

- **Multi-business** → add `businessId` to every table, scope queries.
- **Online payments** → add `OnlinePayment` table linked to `Payment`.
- **Receipts** → add `Receipt` table linked to `Sale`, generate PDF.
- **Employees** → add `User` table with roles, `createdBy` on every transaction.
- **Customer-facing app** → already have customer entities; just add auth + a customer-facing route group.

---

## 11. Phase 1 Deliverable Checklist

- [x] Architecture document (this file)
- [x] Database schema (SCHEMA.md)
- [x] Folder structure proposal (PROJECT_STRUCTURE.md)
- [x] Edge cases catalog (EDGE_CASES.md)
- [x] Project pushed to GitHub

**Phase 1 explicitly does NOT include:** application code, Prisma migration, UI components, API routes. Those wait for Phase 2+.
