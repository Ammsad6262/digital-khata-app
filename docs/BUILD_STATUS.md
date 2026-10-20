# Build Status — Platform Expansion

Last updated: Stage 3 + Insights complete (2026-10-20). Resume at Stage 4 (voice assistant).

## Environment

| Item | Value |
|---|---|
| Working copy | `C:\Users\sadat\dev\digital-khata-app` |
| Branch | `feat/platform-expansion` |
| Local database | Docker Postgres `khata-pg` on `localhost:5433` (seeded sample data) |
| Safe backup | OneDrive `_backups\digital-khata-app-<timestamp>.zip` |
| Live database | **Untouched** (161 users, real data) |

## ✅ Completed in Stage 1

### Critical fixes (verified)
1. **Cross-tenant customer leak** — `searchCustomers` ignored `userId`; a logged-in
   business could see other businesses' customer names, phones and balances.
   Fixed in `src/lib/services/customers.ts` and proven by `scripts/verify-platform.ts`.
2. **Async Client Components** — five `[id]` pages used `"use client"` + `async`.
   Converted to React's documented `use(params)` pattern. (Could not reproduce a
   crash on Next 16.3.5, so treated as latent risk.)
3. **Multi-tenant uniqueness** — `Customer.phone` and `Product.sku` were globally
   `@unique`. Now unique **per business** (`@@unique([userId, phone])`,
   `@@unique([userId, sku])`).

### New schema (local DB applied)
- `Supplier`
- `Purchase`
- `PurchaseItem`
- `SupplierPayment`
- `Reminder`
- `Transaction.supplierId` (supplier rows in the unified ledger)
- `Customer.nextFollowUpAt`, `Supplier.nextFollowUpAt`

### New backend
- `src/lib/schemas/supplier.ts`
- `src/lib/services/suppliers.ts` (tenant-scoped CRUD + derived payable balance)
- `src/app/api/suppliers/route.ts` (GET list/search, POST create)
- `src/app/api/suppliers/[id]/route.ts` (GET with balance, PATCH, DELETE with guard)

### Verification
- `scripts/verify-platform.ts` → **9/9 passed**
  (tenant isolation ×4, supplier payable math, delete guard)
- `scripts/test-foundation.ts` → **17/17 passed**
- `scripts/audit-data-integrity.ts` → **17/17 passed**
- `npm run typecheck` → clean
- `npm run build` → clean

---

## ✅ Completed in Stage 2 (2026-10-20)

### Supplier UI (usable end-to-end)
- `/more/suppliers` — searchable list with payable per supplier (owes / advance / settled)
- `/more/suppliers/new` — add supplier (name, phone, email, address, notes, opening balance)
- `/more/suppliers/[id]` — detail: payable, totals, purchase history, payment history
- `/more/suppliers/[id]/edit` — edit (opening balance locked, same rule as customers)
- `/more/suppliers/[id]/purchase/new` — add purchase
- `/more/suppliers/[id]/payment/new` — record payment
- "Suppliers" added to the More drawer.

### Purchases (stock in)
- `src/lib/schemas/purchase.ts`, `src/lib/services/purchases.ts`
- API: `GET/POST /api/suppliers/[id]/purchases`, `GET/DELETE /api/purchases/[id]`
- Atomic: purchase + items + StockMove (batch) + ledger rows in one transaction.
- Stock comes from the linked StockMove; voiding the purchase removes it.
- Guards: paid ≤ total, tenant isolation, duplicate-submit (60s window),
  cannot void if any batch has already been (partly) sold.

### Supplier payments (money out)
- `src/lib/schemas/supplier-payment.ts`, `src/lib/services/supplier-payments.ts`
- API: `GET/POST /api/suppliers/[id]/payments`, `GET/DELETE /api/supplier-payments/[id]`
- Writes a ledger row (`type: "supplier_payment"`, direction `credit`) and
  deletes it when the payment is voided.
- Guards: cannot overpay an invoice, duplicate-submit, tenant isolation.

### Payable model (important)
Payable is DERIVED, never stored:
`openingBalance + SUM(purchase.outstanding) − SUM(supplierPayment.amount)`
Using `outstanding` (not `totalAmount`) means money paid at purchase time is
counted exactly once. Applied in `getSupplierBalance`, `listSuppliersWithBalance`,
`searchSuppliers`.

### Transaction ledger
- `supplier_payment` added to `TransactionType`, the transactions filter, both
  transaction list components, and counted as money-out in the summary.

### AI provider fixed
- `gemini-3.8-flash` **times out** with the configured key; `gemini-3.5-flash`
  and `gemini-flash-latest` work.
- Reordered `MODEL_CHAIN` and made fallback also trigger on 404 / timeout /
  non-HTTP errors (previously only 429/503/500, so a dead model broke Smart Entry).
- Verified a real call: "Ahmed bought 5 boxes of Rice at 1200 per box, paid 2000"
  → `CREATE_CREDIT_SALE`, Ahmed, Rice, 5 box, 1200, paid 2000.

### Verification
- `scripts/verify-purchases.ts` → **27/27 passed** — stock in/out, payable math,
  part-payment, overpay guard, duplicate guard, tenant isolation ×3, void guards,
  ledger sync.
- `scripts/verify-platform.ts` → **9/9 passed**
- `scripts/verify-ai.ts` → real Gemini call OK
- `npm run typecheck` → clean
- `npm run build` → clean (exit 0)

### Git
`feat/platform-expansion` pushed to GitHub. **`main` was NOT pushed**, so Vercel
has not deployed anything.

---

## ✅ Completed in Stage 3 (2026-10-20) — Reminders

- `src/lib/schemas/reminder.ts`, `src/lib/services/reminders.ts`
- API: `GET/POST /api/reminders`, `GET/PATCH/DELETE /api/reminders/[id]`
  (`PATCH` accepts `completed: boolean` to toggle, or any field to edit).
- UI: `/more/reminders` (filter tabs Today / Overdue / Upcoming / Completed / All
  with live counts), `/more/reminders/new`, `/more/reminders/[id]` (edit + delete).
- Optional links to a customer, supplier or product; all links are
  tenant-verified.
- `Customer.nextFollowUpAt` / `Supplier.nextFollowUpAt` are kept in sync with the
  EARLIEST open linked reminder (derived cache, recomputed on create / edit /
  complete / reopen / delete / re-link).
- Dashboard card (`RemindersCard`) shows overdue + due-today counts and hides
  itself when nothing is due.
- Added to the More drawer.

### Verification
- `scripts/verify-reminders.ts` → **24/24 passed** — filters, counts, next-follow-up
  sync on every mutation, delete, tenant isolation ×6.
- `npm run typecheck` → clean
- `npm run build` → clean (exit 0)

---

## ✅ Completed (2026-10-20) — Evidence-based Insights

- `src/lib/services/insights.ts` — deterministic engine built only from the
  business's own records:
  - top 5 products by revenue over the last 30 days (quantity + revenue)
  - slow movers: in stock but unsold for 30 days, with stock value at cost
  - low stock (below each product's threshold)
  - sales trend: this month vs last month and this week vs last week
  - receivables (total + customer count) and payables (total + supplier count)
  - inactive customers who still owe money (no activity for 30+ days)
- `GET /api/insights` (active-access gated).
- UI `/more/insights` (`InsightsView`) + entry in the More drawer.
- No estimates anywhere: an empty business returns zeros and empty lists, and
  a missing baseline returns `changePct: null` instead of inventing a number.

### Verification
- `scripts/verify-insights.ts` → **24/24 passed** — 30-day window boundaries,
  top-product ordering, slow-mover stock value, month totals, receivables,
  payables, inactive-customer detection, empty business, tenant isolation.

---

## 🚨 Critical finding: migrations are unusable

Every file in `prisma/migrations/` uses **SQLite DDL** (`DATETIME`, etc.). They
**cannot run on Postgres** — `prisma migrate deploy` fails on the very first
migration with `type "datetime" does not exist`.

The live database was therefore **not** built by these migrations, and it has
drifted:

- **6 migrations exist in the live DB but not in the repo**
  (`add_custom_units`, `multi_tenant_required_owner`, `rls_policies`,
  `rls_user_table`, `revert_user_force_rls`, plus a duplicate).
- **1 migration exists in the repo but is not recorded in the live DB**
  (`20261006010000_add_smart_entry_session`) even though the table exists.

**Before any production deploy**, we must regenerate a clean Postgres baseline
from `schema.prisma` and reconcile it against the live DB. Do not run
`prisma migrate deploy` against production until this is done.

### ✅ Production delta is ready (prepared, not yet applied)

`prisma/production/20261020_stage2_3_delta.sql` contains the exact additive
delta from the currently deployed schema to the new one:

- new tables: `Supplier`, `Purchase`, `PurchaseItem`, `SupplierPayment`, `Reminder`
- new columns: `Transaction.supplierId`, `Customer.nextFollowUpAt`
  (`Supplier.nextFollowUpAt` ships with its new table)
- per-business uniqueness: `Customer(userId, phone)` and `Product(userId, sku)`;
  the old global `Customer_phone_key` / `Product_sku_key` are dropped
- all 14 foreign keys

Safety properties, verified on a scratch Postgres database:

- wrapped in `BEGIN … COMMIT` (rolls back entirely on any error)
- idempotent — applied **twice** with zero errors
- after applying, `prisma migrate diff --from-url <scratch> --to-schema-datamodel
  prisma/schema.prisma` returns “this is an empty migration” (**exact match**)
- no `DELETE`, `UPDATE` or `DROP TABLE` — only the two old unique indexes are
  dropped, which only relaxes constraints

Before applying, run the duplicate pre-checks in the file header (phone numbers
and SKUs per business). Then apply via the Supabase SQL editor or `psql` with
the DB password. **Not applied yet — requires the production DB password or
approval to run DDL through the Supabase Management API.**

---

## ⏭️ Remaining stages

| Stage | Scope |
|---|---|
| ~~2~~ | ~~Supplier UI (list/add/detail), purchases, supplier payments~~ ✅ done |
| 3 | Reminders module (UI + API + linking) ✅ done |
| 4 | Universal voice-assistant action system — **mostly pre-existing**: 8 intents already live (sale, expense, payment, customer, product, stock intake, query, clarify); still missing purchase / supplier-payment / reminder intents. **next** |
| 5 | AI Sales Growth Assistant — the deterministic evidence engine now exists (see Insights); the AI narration layer is not built yet |
| 6 | Evidence-based AI business insights ✅ deterministic core done |
| 7 | Premium/AI plan gating (backend-enforced) — subscription/trial gate exists on every API; no separate AI plan tier yet |
| 8 | UX polish + full acceptance-workflow testing |

---

## 🔑 Blockers / required from owner

1. **`GEMINI_API_KEY`** — required for Smart Entry, the expanded voice assistant,
   and any AI insights. Without it those features cannot run or be tested.
2. **GitHub write access** — to push `feat/platform-expansion` and open a PR.
3. **Vercel / deployment access** — to ship changes; pushing code does not update
   a live site by itself.
4. **Supabase DB password** — only needed when we run managed migrations.
5. **Rotate the Supabase access token** that was shared in chat.
