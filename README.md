# Digital Khata & Wholesale Business App

A mobile-first web application that replaces paper khata/registers for small wholesale businesses. Tracks customers, credit (udhaar), sales, payments, products, stock, expenses, and gives the owner a clean dashboard with auto-calculated balances.

> **Status:** Phase 14 — Data Integrity Audit complete (10 bugs found + fixed, 17/17 audit checks passing)

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
- [x] Phase 4 — Dashboard built (mobile-first, real data, sample seeder)
- [x] Phase 5 — Customers/Khata system (list, search, detail, add form)
- [x] Phase 6 — Sales system (New Sale form with multi-product, list, detail, void, date filters)
- [x] Phase 7 — Payments system (Add Payment form, list, detail, void, overpayment handling)
- [x] Phase 8 — Products + Stock Management (list, search, add, edit, detail, stock moves, adjustments)
- [x] Phase 9 — Expenses system (list, add, edit, detail, void, date filtering)
- [x] Phase 10 — Transaction History (unified feed with date + type filters, custom date range)
- [x] Phase 11 — Search + UX improvements (sticky form actions, global search, inline quick-add)
- [x] Phase 12 — Backup & Export (JSON full backup/restore + per-table CSV export)
- [x] Phase 13 — Settings (business info, currency, theme switcher, PIN security, data management)
- [x] Phase 14 — Data Integrity Audit (10 bugs found + fixed, 17/17 audit checks passing)
- [ ] Phase 15 — TBD (awaiting instructions)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create the SQLite DB and run migrations
npm run db:migrate

# (Optional) Load realistic sample data for testing the dashboard
npm run db:seed

# Run the foundation test suite (17 tests, verifies DB + atomic operations)
npm run test:foundation

# Start the dev server
npm run dev
```

Visit http://localhost:3000 — the dashboard loads with real data: total receivables, today's sales/payments/expenses, low-stock alerts, recent activity feed, and 4 quick-action buttons.

---

**Tech stack (proposed):** Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Prisma · SQLite (V1) · TanStack Query · React Hook Form + Zod
