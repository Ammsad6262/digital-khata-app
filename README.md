# Digital Khata & Wholesale Business App

A mobile-first web application that replaces paper khata/registers for small wholesale businesses. Tracks customers, credit (udhaar), sales, payments, products, stock, expenses, and gives the owner a clean dashboard with auto-calculated balances.

> **Status:** Phase 3 — Foundation built (DB + services + API + app shell)

---

## 🎯 Core Purpose

Replace the business's paper registers with a digital system that **automatically calculates everything** — customer balances, stock quantities, business totals — so the owner never has to do manual math.

## 🧱 Core Data Relationships (the heart of the app)

| Action | Side effects (automatic) |
|---|---|
| **Sale** | Customer balance ↑ · Stock ↓ · Sale recorded |
| **Payment** | Customer balance ↓ · Payment recorded |
| **Stock addition** | Stock ↑ · Stock move recorded |
| **Expense** | Expense total ↑ · Expense recorded |

> The customer's balance is **always derived from transactions**, never manually edited.

## 📱 V1 Navigation (mobile-first bottom nav)

```
Dashboard | Khata | Sales | Stock | More
                              └── Customers, Products, Expenses,
                                  Transactions, Settings
```

## 🚫 V1 Exclusions (intentionally NOT built)

- Receipt generator · Payroll · Employee management · Advanced accounting
- AI features · Loyalty system · Online payments · Multi-business
- Customer login/accounts · Complex permissions · Advanced analytics
- Complicated invoicing · Unnecessary notifications

## 📂 Project Documents

See the [`docs/`](./docs) folder for the full architecture proposal:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Tech stack, layering, principles
- [`docs/SCHEMA.md`](./docs/SCHEMA.md) — Database schema overview
- [`docs/DATA_ARCHITECTURE.md`](./docs/DATA_ARCHITECTURE.md) — **Phase 2:** Entity defs, balance/stock formulas, atomic operations
- [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md) — Planned folder structure
- [`docs/EDGE_CASES.md`](./docs/EDGE_CASES.md) — Edge cases & decisions

The canonical Prisma schema: [`prisma/schema.prisma`](./prisma/schema.prisma)

## 🛠️ Implementation Status

- [x] Phase 1 — Architecture & planning
- [x] Phase 2 — Database & data architecture (Prisma schema + design docs)
- [x] Phase 3 — Foundation built (DB, services, API, app shell, 17 passing tests)
- [ ] Phase 4 — TBD (awaiting instructions)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create the SQLite DB and run migrations
npm run db:migrate

# Run the foundation test suite (17 tests, verifies DB + atomic operations)
npm run test:foundation

# Start the dev server
npm run dev
```

Visit http://localhost:3000 — the app shell loads with the bottom navigation and a placeholder dashboard.

---

**Tech stack (proposed):** Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Prisma · SQLite (V1) · TanStack Query · React Hook Form + Zod
