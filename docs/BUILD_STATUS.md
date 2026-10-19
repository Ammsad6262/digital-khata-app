# Build Status — Platform Expansion

Last updated: Stage 1 (2026-10-19)

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

---

## ⏭️ Remaining stages

| Stage | Scope |
|---|---|
| 2 | Supplier UI (list/add/detail), purchases, supplier payments |
| 3 | Reminders module (UI + API + linking) |
| 4 | Universal voice-assistant action system |
| 5 | AI Sales Growth Assistant |
| 6 | Evidence-based AI business insights |
| 7 | Premium/AI plan gating (backend-enforced) |
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
