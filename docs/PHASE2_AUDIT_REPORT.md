# Phase 2 — Verification, Repair & Honest Status Report

**Date:** 2026-11-01
**Scope:** Audit the existing Digital Khata app, run the real business workflows
end-to-end, fix what is genuinely broken, and report honestly what works, what
was repaired, and what is still missing.
**Branch:** `feat/platform-expansion` (commit `0f40390`). `main` (`ea38627`) was
not touched.

This report is the result of executing the app, not reading its screens.

---

## 1. How this was verified

| Layer | What it proves |
|---|---|
| Throwaway local Postgres (Docker `khata-pg`, port 5433) + `prisma db push --force-reset` | The schema in `prisma/schema.prisma` builds and the app runs against a real database. No production data was used. |
| `npx tsc --noEmit` | The whole codebase type-checks clean. |
| `npm run build` (`next build`) | The app compiles for production (`✓ Compiled successfully`). |
| 24 scripted suites (service + HTTP + security) | Business rules, cross-module maths and isolation. |
| A real browser against `localhost:3000` | The actual UI wires to the real APIs and changes real data. |

**890 assertions passed, 0 failed** across the suites below.

| Suite | Assertions |
|---|---|
| `scripts/test-foundation.ts` | 17 / 17 |
| `scripts/test-acceptance-http.ts` (new) | 153 / 153 |
| `scripts/audit-data-integrity.ts` | 17 / 17 |
| `scripts/verify-acceptance.ts` | 31 / 31 |
| `scripts/verify-platform.ts` | 9 / 9 |
| `scripts/verify-purchases.ts` | 42 / 42 |
| `scripts/verify-reminders.ts` | 24 / 24 |
| `scripts/verify-insights.ts` | 26 / 26 |
| `scripts/verify-growth.ts` | 26 / 26 |
| `scripts/verify-contact-actions.ts` | 36 / 36 |
| `scripts/verify-statement.ts` | 19 / 19 |
| `scripts/verify-follow-ups.ts` | 50 / 50 |
| `scripts/verify-reports.ts` | 67 / 67 |
| `scripts/verify-receipt.ts` | 26 / 26 |
| `scripts/verify-due-dates.ts` | 30 / 30 |
| `scripts/verify-discounts.ts` | 36 / 36 |
| `scripts/verify-units.ts` | 9 / 9 |
| `scripts/verify-backup.ts` | 42 / 42 |
| `scripts/verify-recovery.ts` | 42 / 42 |
| `scripts/verify-audit.ts` | 27 / 27 |
| `scripts/verify-ai-gating.ts` | 9 / 9 |
| `scripts/verify-assistant-writes.ts` | 33 / 33 |
| `scripts/verify-ai-query-types.ts` | 28 / 28 |
| `scripts/verify-password-reset.ts` | 42 / 42 |
| `scripts/audit-security.mjs` | 49 / 49 |

---

## 2. Bugs found and fixed

### 2.1 Dashboard showed stale numbers after every change
**Where:** `src/lib/services/dashboard.ts`
The dashboard kept its **own** in-memory cache (`dashboardCache`). Every mutation
(sale, payment, expense, stock, purchase …) calls `invalidateCache("dashboard")`,
but that only cleared the **shared** cache in `src/lib/utils/cache.ts` — nothing
ever cleared the dashboard's private map. Result: after recording a sale the home
screen could show the previous figures for up to 5 seconds.

This is exactly the "a sale must update the dashboard / editing a transaction must
update every affected calculation" requirement, and the new HTTP suite proved it
(`dashboard reflects the sale immediately` failed before the fix, passes after).

**Fix:** the dashboard now uses the shared cache under a per-tenant key
(`dashboard:<userId>`), so every mutation's `invalidateCache("dashboard")`
genuinely clears it. `clearDashboardCache()` is kept and delegates to the shared
cache.

### 2.2 Malformed JSON body returned HTTP 500 instead of 400
**Where:** `src/lib/utils/api.ts`, `src/app/api/backup/import/route.ts`
`parseJsonBody()` returned an error string, and every route reacted with
`fail(new Error(message))` → a generic **500 INTERNAL**. A client sending a broken
body got "Internal server error" instead of a clear client error.

**Fix:** `parseJsonBody()` now throws a `BadRequestError` (400) for malformed or
oversized bodies. Every route already runs inside `try/catch`, so the status is
now correct. `backup/import` (which called `req.json()` directly) was switched to
the same helper. The new suite asserts `malformed JSON is rejected as a client
error`.

---

## 3. Test defects found and fixed (not app bugs)

- **`scripts/verify-insights.ts`** asserted the previous-month sales total as if
  today were always late in the month. On the 1st–10th the 5- and 10-day-old
  sales are *also* in the previous month, so the expectation was wrong. The
  service figure (1900) was correct; the expectation now filters every sale
  date into the window. Suite went 25/1 → 26/0.
- **`scripts/audit-security.mjs`** read `.env` from a hard-coded
  `/home/z/my-project/...` path from another machine. Changed to a path relative
  to the script so it runs here.

---

## 4. New test suite

`scripts/test-acceptance-http.ts` — runs against a live server with a real session
cookie and exercises the app the way a browser does (routing → middleware → auth →
validation → database). Run with `npm run test:acceptance` after `npm run dev`.

It covers: auth/session, customers & ledger, products & stock, credit sale with
partial payment, standalone payment, discounts, expenses & profit/loss, suppliers
→ purchases → payables, supplier overpayment rejection, reminders, reports,
tenant isolation (a second user gets 404/empty everywhere), void propagation,
edit persistence & guarded delete, smart-entry (must never write; execute without
a session rejected), admin secret enforcement, subscription redemption, settings &
custom units, transactions, audit log, customer history (running balance equals
current balance), expenses summary, stock moves, insights, growth, growth
narration, recovery, recovery contact/remind, follow-ups (candidates/create/
outcome), backup export → **restore round-trip**, and CSV export.

The suite creates two throwaway users and deletes their rows at the end.

---

## 5. Verified working (cross-module integration)

- **Customers / ledger** — opening balance, sales debit, payments credit, live
  balance, running-balance history that ends exactly on the current balance.
- **Products / stock** — opening stock, stock = opening + moves − sold; a sale
  reduces stock; voiding restores it; a purchase increases it.
- **Sales** — totals, per-line totals, discounts (300 − 100 = 200), partial
  payment, outstanding, due date/overdue, void, receipt text.
- **Payments** — standalone and sale-linked; sale `paidAmount`/`outstanding`
  recomputed from the true sum of payments (no drift).
- **Expenses / P&L** — revenue, COGS (batch cost or product purchase price),
  gross profit, expenses, net profit; expenses never touch a customer balance.
- **Suppliers / purchases / payables** — purchase totals, outstanding, supplier
  payable, overpayment rejected, stock goes up.
- **Reports** — sales billed, cash received, purchases billed, expenses, profit,
  receivables, payables, for any period.
- **Reminders / follow-ups / recovery** — create, complete, log a contact, create a
  reminder; follow-up outcomes persist.
- **Insights / growth** — top products, slow movers, receivables/payables, sales
  trend, "collect from the customer who owes money".
- **AI smart entry** — live Gemini interpretation produced a correct form
  (customer/product resolved, unit price, paid amount), and executing it created
  the sale (stock 100 → 95, balance 1000 → 2000), a payment (balance → 1500) and an
  expense (P&L expenses 200). Re-executing the same session is idempotent (no
  duplicate sale). Interpret alone never writes. AI gating is backend-enforced.
- **Subscriptions / billing** — redeem a valid admin code, single redemption
  enforced, redemption history; `billingEnabled` is `false`.
- **Backup** — export, restore into the same account (counts and balances survive),
  CSV export, per-tenant isolation.
- **Security** — 49/49 security assertions: cross-tenant reads blocked on every
  endpoint, unauthenticated requests rejected, smart-entry sessions isolated, no
  secrets/env/DB URLs leaked in errors, negative quantities/amounts rejected.

### Verified through the real UI (browser)
Signed up and logged in through `/login`; created a customer (`Rs. 500`) and a
product (`UI Rice`, stock 20) through the forms; created a sale through
`/sales/new` (2 × 150 with a 100 discount → total 200); recorded a payment through
`/payments/new` (→ paid 100, due 100); confirmed the dashboard showed receivables
**Rs. 600**, today's sales **200**, payments **100**, correct P&L, and the growth
plan suggesting the collection; and confirmed the product stock became **18**.

---

## 6. What was NOT verified / known limitations

- **Playwright browser suites not run.** `scripts/full-audit.mjs`,
  `scripts/audit-smart-entry.mjs`, `scripts/test-smart-entry-*.mjs`,
  `scripts/test-v*.mjs`, `scripts/test-urdu-*.mjs` all `import { chromium } from
  "playwright"`, and Playwright is **not a dependency** and isn't installed. Their
  logic is covered by the service/HTTP suites above and by the manual browser run,
  but they were not executed. They also still contain a hard-coded
  `/home/z/my-project/...` `.env` path.
- **Mobile layout and Urdu rendering** were not exhaustively checked — only that
  the pages load. (`test-urdu-*` are the Playwright suites that couldn't run.)
- **Voiding a sale reverses every payment linked to that sale**, including
  payments recorded later. This is intentional and the UI warns about it
  ("Voiding will reverse them — the customer's balance will rise by the net
  effect"), but the cash then disappears from the ledger. Worth a product decision
  (block it, or keep later payments as a credit).
- **Payment dates are day-granularity** (the form sends a date, stored at local
  midnight), so "time ago" in Recent Activity reads e.g. "16 hr ago" for a payment
  made today. Totals and reports are unaffected.
- **Smart entry defaults "bought X for Y" to fully paid** unless the phrase says
  otherwise; the confirmation form is editable and shows the resulting balance.
- **Live AI is strict and can be slow.** The model sometimes returns a payload
  that omits fields the strict Zod schema requires (e.g. `batchName`,
  `explicitUnitPrice`, `explicitTotal`). That fails validation, triggers the
  model fallback chain, and when every model fails the route returns **HTTP 200
  with status `FAILED` (no write)** so the user can retry or enter it manually.
  Fallbacks were observed taking 20–90s. Degradation is graceful, but the
  strictness/`null`-handling of the AI schema is worth revisiting.
- **RLS is defence-in-depth, not the enforcer.** The app role bypasses RLS, so
  isolation is enforced by explicit `userId` filters in every query. Those filters
  are what the isolation tests actually exercise (and pass).
- **Migration drift** remains as documented — the repo's migration history does
  not fully match the live database; local testing therefore uses
  `prisma db push` rather than `migrate deploy`.

## 7. External integrations needed to go live commercially

- **Gemini API key** (present) for smart entry/insights; free-tier rate limits
  mean AI checks can intermittently fail and must degrade gracefully (they do).
- **WhatsApp / print** are client-side share/print links — they open the user's own
  apps; there is no server-side messaging integration.
- **A real payment provider** is required before `BILLING_ENABLED=true`. Billing
  stays disabled; no feature is paywalled and no payment is simulated.
- **Vercel Hobby is non-commercial**; a commercial launch needs Pro.

## 8. Pending owner actions

1. Approve any push/merge to `main` (`ea38627` is untouched).
2. Rotate secrets shared in earlier chats (Supabase token, GitHub tokens,
   Gemini key, and any Vercel token).
3. Apply the pending production DDL only with explicit approval (listed in
   `docs/BUILD_STATUS.md`).
