# Build Status — Platform Expansion

Last updated: Stage 3 + Insights + AI gating + assistant queries complete (2026-10-20).

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

## ✅ Completed (2026-10-20) — AI gating enforced on the server

- Found a real gap: `/api/smart-entry/interpret`, `/execute` and `/cancel` used
  `requireUserId` (logged-in only), so an account with an **expired**
  subscription could still use AI.
- All three now use `requireActiveAccess` → expired accounts receive **403**
  before any AI work or body parsing happens.
- Fixed a latent ESM interop bug in `src/lib/services/auth.ts`:
  `await import("bcryptjs")` returns the functions under `.default` in plain
  Node/tsx, which made `registerUser` crash outside Next. Now supports both
  shapes (no behaviour change inside Next).

### Verification
- `scripts/verify-ai-gating.ts` → **5/5 passed** — expired account blocked on
  interpret/execute/cancel (403), invalid token (401), active trial passes the
  gate (400 validation, not 403).
- `npm run typecheck` + `npm run build` → clean.

---

## ✅ Completed (2026-10-20) — Assistant queries for new modules

- Added two query types to the Smart Entry assistant:
  - `SUPPLIER_PAYABLES` — “how much do I owe suppliers?” (total + per-supplier)
  - `TODAYS_REMINDERS` — “what reminders do I have today?” (overdue + due today)
- Wired through all three layers: Zod schema, Gemini response schema (the enum
  that actually constrains the model), and `processQuery`.
- Read-only: no confirmation needed, no financial mutation.

### Verification
- `scripts/verify-ai-queries.ts` → **2/2 routed correctly** against the real
  Gemini API (one request took a 129s fallback path; it still succeeded).
- `npm run typecheck` + `npm run build` → clean.

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
| 4 | Universal voice-assistant — 11 write intents + 9 query types live. Added **write** intents `SUPPLIER_PAYMENT`, `CREATE_REMINDER` and `CREATE_PURCHASE` end to end. |
| 5 | AI Sales Growth Assistant — **done**. Deterministic recommendation engine + `/more/growth`, with AI narration that is numerically validated against the fact sheet. |
| 6 | Evidence-based AI business insights ✅ deterministic core done |
| 7 | AI gating (backend-enforced) ✅ done — all AI endpoints require active access; a separate paid AI tier needs a product decision (no fake payment flow added) |
| 8 | UX polish + full acceptance-workflow testing — **done**. `scripts/verify-acceptance.ts` runs the 10 owner workflows end to end: **31/31**. Also fixed an unbounded supplier-payment bug found by that suite (see below). |

---

## Latest update — assistant write actions (commit `c72e11d`)

Added two new voice/text write intents to Smart Entry:

| Intent | What happens | Safety |
|---|---|---|
| `SUPPLIER_PAYMENT` | "I paid Ali 5000" → resolves the supplier, shows a confirmation form (supplier, amount, method, current payable), then calls `createSupplierPayment` | Atomic single-claim session guard, tenant-scoped lookup, duplicate submit guard from the payments service |
| `CREATE_REMINDER` | "Remind me to call Ahmed tomorrow" → resolves customer (optional), pre-fills title/date/priority/type, then calls `createReminder` | Same session guard; due date computed server-side from `reminderInDays` |
| `CREATE_PURCHASE` | "Bought 10 kg sugar from Ali at 100 each, paid 400" → resolves supplier + product, pre-fills qty/cost/paid, shows total and the amount that will be added to payable, then calls `createPurchase` | Same session guard; stock + ledger update and the "paid ≤ total" rule are enforced inside the purchase transaction, so a rejected submit leaves no partial stock move |

Routing is AI-assisted but every value the user sees is resolved **server-side**;
the model never supplies IDs. Both intents are confirmation-first — nothing is
written until the user taps the confirm button.

Verification:

- `npx tsc --noEmit` — clean
- `npm run build` — clean (exit 0)
- `npx tsx scripts/verify-assistant-writes.ts` — **33/33** assertions
  (supplier payment + payable maths, reminder + `nextFollowUpAt` sync,
  purchase total/paid/outstanding, stock move, payable increase, overpay
  rejection with no partial stock, duplicate and cross-tenant blocking)
- `npx tsx scripts/verify-ai-queries.ts` — **5/5** live Gemini cases
  (2 query types, supplier payment extraction, "tomorrow" → 1 day,
  purchase supplier/qty/unit-price/paid extraction)

---

## Completed — AI Sales Growth Assistant (`/more/growth`)

**Deterministic engine** (`src/lib/services/growth.ts`) turns the existing
insight facts into six kinds of action:

| Type | Trigger | Evidence shown |
|---|---|---|
| Collect receivables | Top 3 outstanding balances | Amount + share of receivables + days idle |
| Re-engage customer | Owed money, no activity in 30+ days | Balance + days inactive |
| Restock | Low stock **and** sold in the last 30 days | Units sold + units left |
| Clear dead stock | Stock on hand with no sales in 30 days | Capital tied up (stock × cost) |
| Promote product | Top sellers by revenue | Revenue for 30 days |
| Plan supplier payment | Largest positive payable | Payable balance |

Rules enforced: no recommendation without evidence, revenue is never called
profit, no forecasts, priority ordering (high → medium → low, then amount).

**AI narration** (`/api/growth/summary`) rewrites the facts in 2–3 sentences.
Guardrails:
- every number in the output must already exist in the fact sheet
  (`numbersAreSupported`), otherwise the deterministic summary is returned;
- truncated/incomplete answers are rejected;
- 10-minute per-business cache;
- Gemini unavailable → deterministic summary, clearly labelled in the UI.

Verification:

- `npx tsx scripts/verify-growth.ts` — **26/26** assertions (amounts, priority,
  totals, empty business, tenant isolation, narration number guard)
- `npx tsx scripts/verify-ai-gating.ts` — **8/8** (growth endpoints reject
  expired accounts with 403 before any AI work)
- `npx tsx scripts/verify-growth-ai.ts` — live Gemini run: safe narration
  (falls back to the computed summary when Gemini returns 503)
- `tsc --noEmit` and `npm run build` — clean

---

## Completed — acceptance workflows + supplier-payment fix

`scripts/verify-acceptance.ts` drives the 10 owner workflows through the real
services, in the order a shop owner would use them:

| # | Workflow | Verified |
|---|---|---|
| 1 | Register + trial | account, token, active trial |
| 2 | Add customer | starts at zero balance |
| 3 | Credit sale | total 5000, outstanding 4000, stock 100 → 90, balance 4000 |
| 4 | Record payment | balance 4000 → 2500 |
| 5 | Record expense | saved to the ledger |
| 6 | Add stock | stock 90 → 140 |
| 7 | Supplier purchase on credit | total 6000, outstanding 5000, stock 160, payable 5000 |
| 8 | Supplier payment | payable 5000 → 3000, overpayment rejected, payable unchanged |
| 9 | Reminder | counted today, follow-up date set then cleared on completion |
| 10 | Insights + growth + AI gating | receivables 2500, payables 3000, growth finds both actions, expired account gets 403 |

Result: **31/31**.

### Bug fixed (found by workflow 8)

`createSupplierPayment` only bounded the amount when a `purchaseId` was given.
A payment with no invoice link accepted any amount — a 999,999 payment was
silently applied, wiping the payable to zero and leaving negative exposure.

Fix (`src/lib/services/supplier-payments.ts`): inside the same transaction, the
supplier's live payable is computed
(`openingBalance + Σ purchase.outstanding − Σ supplierPayment.amount`) and the
payment is rejected with `api.supplierPayment.exceedsPayable` when it exceeds
it. Overpaying is now impossible; record the purchase first if you are paying
up front.

---

## Completed — follow-through round (the app does the next thing for you)

The brief's rule is that the app should drive the owner, not the other way
round. That only works if every action can be *finished* from the screen it
appears on, so this round closes the loop after the contact buttons:

### Snooze in one tap
- `POST /api/reminders/[id]/snooze` + `snoozeReminder()`: **1 day / 3 days /
  1 week** buttons on every reminder card, no need to open the reminder to
  move it.
- Snoozing counts from **now** when the reminder is already overdue, and from
  its own due date when it is still ahead — so a week-late reminder becomes
  due tomorrow instead of immediately overdue again.
- A snoozed reminder is reopened, and the linked customer's `nextFollowUpAt`
  is resynced.

### Reorder without leaving the app
- Restock recommendations now name the **supplier who actually supplied that
  product** (taken from the most recent non-voided purchase — never guessed).
  If the owner has never bought it from anyone, no contact buttons appear.
- The WhatsApp button pre-writes the order: *"We need about 8 bag of Basmati
  Rice 25kg. Please send the rate and availability."*
- The suggested quantity tops the stock back up to the owner's **own**
  low-stock threshold, shown on the card as *Suggested order: 8 bag*.
- The card's main button becomes **Add stock** and links straight to
  `/stock/add?productId=…`, so the reorder is recorded in two taps.

### Why the AI sometimes says "busy" — and what happens then
The API key is on Gemini's **free tier: 20 requests per day, per model**.
Testing exhausted `gemini-3.8-flash` (HTTP 429) while the other models were
returning 503 "high demand". The chain already falls through to the next
model, and when every model is unavailable the page shows the deterministic
summary with *"The AI is busy right now — your own numbers are below."* — never
an error, never a made-up number. **A paid Gemini key removes this ceiling.**

### Verification
- `scripts/verify-contact-actions.ts` — **36/36** (snooze maths, tenant
  isolation, follow-up resync, supplier derivation, suggested quantity)
- All suites re-run: platform 9, purchases 27, reminders 24, insights 24,
  assistant-writes 33, growth 26, contact-actions 36, acceptance 31,
  ai-gating 8, ai-queries 5 — **223 assertions, 0 failures**
- `tsc --noEmit` and `npm run build` — clean

---

## Completed — owner-feedback round (menu everywhere, one-tap contact, AI fixed)

Three things the owner reported after using the app:

### 1. "AI unavailable" on the Growth page — fixed
**Root cause:** Gemini 3.x models spend hidden *thinking* tokens out of the same
output budget. The answer was silently truncated mid-sentence
(`"You have 151700 in total receivables, so focus first on collecting 70000
from Sajid Electronics, 32400 from Imran Stores"`), and the narration guard
correctly refused to show a half-sentence — so it fell back every time.

**Fixes:**
- `thinkingConfig: { thinkingBudget: 0 }` + `maxOutputTokens: 2048`.
- A truncated answer now tries the **next model in the chain** instead of being
  returned, and `tidyNarration()` keeps only whole sentences (max 600 chars)
  when trimming is needed.
- Failures are logged with a reason (`ai-failed`, `incomplete`,
  `unsupported-number`) instead of being swallowed.
- The page now requests the explanation **automatically on load** (so it
  arrives already telling you what to do), with a *Refresh explanation* button;
  a friendly "AI is busy right now — your own numbers are below" note replaces
  the old duplicated summary box.
- Verified live: `Source: ai`, 371 chars, every number checked against the
  fact sheet.

### 2. The ☰ menu is now on every screen
`AppHeader` and `TranslatedHeader` render the global More button themselves, so
every page that uses a header has it — insights, growth, suppliers, reminders,
transactions, products, every form and detail page. No more going back to the
dashboard. (The seven main pages with custom headers already had it, and were
checked for duplicates.)

### 3. Call / WhatsApp on every reminder and every action
- `ContactActions` component: one-tap **Call** (`tel:`) + **WhatsApp**
  (`wa.me`) with a **pre-written message**. Nothing is ever sent for the user.
- `toInternationalNumber()` normalises `0300 1234567`, `+92 300 1234567`,
  `0300-1234567` and `3001234567` → `923001234567`, so WhatsApp links work
  whichever way the number was typed.
- `ReminderView` now carries `customerPhone`, `supplierPhone` and the live
  `customerBalance`. Reminder cards show **Owes Rs 29,050.00** and offer Call /
  WhatsApp with the exact amount already written in the message.
- The same buttons appear on Growth recommendations (collections and supplier
  payments) and on the customer page.
- **New dashboard strip "Do this now"** (`GrowthCard`): the single most
  important action from the owner's own records, with Call / WhatsApp inline.
  Hidden when there is nothing to act on.

### Verification
- `npx tsx scripts/verify-contact-actions.ts` — **20/20** (number
  normalisation, link building, reminder enrichment, growth contacts)
- `npx tsx scripts/verify-growth-ai.ts` — live Gemini: complete, safe narration
- Re-ran every suite: platform 9, purchases 27, reminders 24, insights 24,
  assistant-writes 33, growth 26, acceptance 31 — all passing
- `tsc --noEmit` and `npm run build` — clean

---

## 🔑 Blockers / required from owner

1. **`GEMINI_API_KEY`** — required for Smart Entry, the expanded voice assistant,
   and any AI insights. Without it those features cannot run or be tested.
2. **GitHub write access** — to push `feat/platform-expansion` and open a PR.
3. **Vercel / deployment access** — to ship changes; pushing code does not update
   a live site by itself.
4. **Supabase DB password** — only needed when we run managed migrations.
5. **Rotate the Supabase access token** that was shared in chat.
