# Final report — AI wholesale business management platform

Branch: `feat/platform-expansion` (local). `main` is untouched at `ea38627`.
Nothing has been pushed or deployed. Every number below was produced by a script
that reads your own database rows.

---

## 1. What was built

### Suppliers, purchases, payables
- `Supplier` list / add / detail / edit (`/more/suppliers`), with search and
  per-supplier payable.
- Purchases (`/more/suppliers/[id]/purchase/new`): atomic — purchase + line
  items + stock in + batch + ledger entry in one transaction.
- Supplier payments (`/more/suppliers/[id]/payment/new`), bounded by the live
  payable.
- **Payable is derived, never stored as a figure you have to trust:**
  `openingBalance + Σ purchase.outstanding − Σ supplierPayment.amount`.

### Reminders
- `Reminder` entity with overdue / today / upcoming / completed tabs and counts.
- API + create/edit UI (`/more/reminders`), dashboard `RemindersCard`, More
  drawer entry.
- `Customer.nextFollowUpAt` / `Supplier.nextFollowUpAt` are caches kept in sync
  with the earliest open linked reminder.

### Evidence-based insights
- `GET /api/insights` → top products, slow movers, low stock, inactive
  customers, sales trend.
- Hard rule enforced in code: every figure is computed from your records; empty
  data produces an empty insight, never a guess.

### AI Sales Growth Assistant (this session)
- Deterministic engine (`src/lib/services/growth.ts`) producing six action
  types: collect receivables, re-engage customer, restock, clear dead stock,
  promote product, plan supplier payment — each with the evidence that
  triggered it.
- `/more/growth` page + More drawer entry, EN/UR translations.
- `POST /api/growth/summary` narrates the facts. **Numerically validated:** any
  number the model writes that is not already in the fact sheet causes the
  deterministic summary to be shown instead. Truncated answers are rejected.
  10-minute cache. Gemini down → computed summary, clearly labelled.

### One-tap contact (nothing happens outside the app)
- `ContactActions` — Call (`tel:`) + WhatsApp with a **pre-written message**, on
  reminder cards, growth recommendations, the customer page and the new
  dashboard "Do this now" strip.
- `toInternationalNumber()` accepts `0300 1234567`, `+92 300 1234567`,
  `0300-1234567` or `3001234567`.
- Reminders show the live balance owed and pre-fill the message with the exact
  amount. Nothing is ever sent without the owner pressing send.
- The ☰ menu is rendered by `AppHeader`/`TranslatedHeader`, so it is on **every**
  screen.

### Follow-through (finish the job on the same screen)
- **Snooze**: 1 day / 3 days / 1 week on every reminder card, no need to open
  it. Overdue reminders snooze from today; future ones from their own date.
- **Reorder**: restock recommendations name the supplier from the owner's most
  recent purchase of that product, pre-write the WhatsApp order, and link
  straight to `/stock/add?productId=…`. The suggested quantity tops up to the
  owner's own low-stock threshold.
- The dashboard "Do this now" strip always shows the single highest-priority
  action with Call / WhatsApp available inline.
- **Send the khata statement**: one tap on the customer page opens WhatsApp with
  the balance, the last five entries and the lifetime totals already written —
  in English or Urdu, with the business name. A copy-to-clipboard button covers
  every other app. Nothing is sent until the owner presses send.

### Voice / text assistant
- Read queries: includes `SUPPLIER_PAYABLES` and `TODAYS_REMINDERS`.
- Write intents: `SUPPLIER_PAYMENT`, `CREATE_REMINDER`, `CREATE_PURCHASE` —
  confirmation-first, model never supplies IDs or prices (all resolved
  server-side).
- Backend-enforced gating: every AI endpoint calls `requireActiveAccess`.

### Foundations
- Cross-tenant leak in customer search fixed; tenant scoping enforced in every
  new service.
- Exact decimal money math (`Decimal`), never floats.
- Revenue is labelled revenue everywhere; profit is never presented.
- No industry-specific units hardcoded — units are per-product, defaults are
  configurable.

---

## 2. Bugs fixed

| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | `searchCustomers` returned other tenants' rows | data leak | user filter added to the query |
| 2 | Five detail pages were `"use client"` + `async` | crash / no render | converted to `use(params)` |
| 3 | bcrypt ESM interop in `auth.ts` | auth could fail on some runtimes | interop-safe import |
| 4 | Gemini fallback ignored 404 / timeout / null | assistant died on one model outage | `MODEL_CHAIN` reordered, `isTransient` broadened |
| 5 | 95 rows with `userId = NULL` (from the old seed) | empty dashboard | local data repaired (attached to the owning account); `seed-sample-data.ts` replaced by a non-destructive seed |
| 6 | **Supplier payment with no invoice link had no upper bound** | a 999,999 payment was silently accepted, wiping the payable | payable computed inside the transaction; `api.supplierPayment.exceedsPayable` returned |
| 7 | **AI narration was truncated by Gemini thinking tokens** | the Growth page always showed "AI unavailable" | thinking disabled, 2048-token ceiling, truncated answers retried on the next model, whole-sentence trimming |

Bug 6 was found by the acceptance suite, not by inspection.

---

## 3. Tests passed

| Suite | Purpose | Result |
|---|---|---|
| `scripts/verify-acceptance.ts` | the 10 owner workflows, end to end | **31/31** |
| `scripts/verify-platform.ts` | platform / core operations | 9/9 |
| `scripts/verify-purchases.ts` | supplier payment + payable maths, purchase totals, stock, overpay rejection, duplicate + cross-tenant blocking | 27/27 |
| `scripts/verify-reminders.ts` | reminder + follow-up sync | 24/24 |
| `scripts/verify-insights.ts` | insight figures match the ledger | 24/24 |
| `scripts/verify-growth.ts` | growth amounts, priority, totals, empty business, tenant isolation, narration guard | 26/26 |
| `scripts/verify-ai-gating.ts` | AI endpoints 403 for expired accounts (incl. growth) | 8/8 |
| `scripts/verify-assistant-writes.ts` | voice write-path extraction | 33/33 |
| `scripts/verify-ai-queries.ts` | live Gemini routing | 5/5 |
| `scripts/verify-contact-actions.ts` | phone normalisation, Call/WhatsApp links, reminder enrichment, snooze, supplier reorder | 36/36 |
| `scripts/verify-statement.ts` | WhatsApp khata statement: exact balance, entry order, advance/settled wording, Urdu | 19/19 |

Total: **242 assertions passing**. `npx tsc --noEmit` and `npm run build` are
clean.

The 10 acceptance workflows: register+trial · add customer · credit sale (stock
and ledger move) · record payment · record expense · add stock · buy from
supplier on credit · pay supplier (overpay rejected) · create+complete reminder
· insights + growth + gating.

---

## 4. Database changes

New models: `Supplier`, `Purchase`, `PurchaseItem`, `SupplierPayment`,
`Reminder`.
New columns: `Customer.nextFollowUpAt`, `Supplier.nextFollowUpAt`, purchase
totals (`totalAmount`, `paidAmount`, `outstanding`), purchase-item lines,
supplier/reference links on ledger rows.
Uniqueness: `@@unique([userId, phone])` on `Customer`,
`@@unique([sku, userId])` on `Product` (per-tenant, not global).

Production DDL: `prisma/production/20261020_stage2_3_delta.sql` — additive,
transactional, idempotent, 14 foreign keys. Applied twice to a scratch database
and verified to produce a schema identical to Prisma's.

No schema change was needed for the three new voice write intents.

---

## 5. Incomplete / blocked

| Item | Status | Blocker |
|---|---|---|
| Production deploy | not started | the delta must be applied to Supabase (needs the DB password or approval to run DDL); `GEMINI_API_KEY` must be added to Vercel |
| Push `main` / open PR | deliberately not done | waiting for your review + the production delta |
| Paid premium / AI tier | not built, by your decision | you said you will not go with a premium plan, so none was added. Gating continues to ride the existing trial + redeem codes; no payment flow exists to fake. |
| Forgot-password / reset | does not exist | `PATCH /api/account/password` requires the current password; a reset flow needs email or an admin decision |
| AI narration quality | works, with fallback | the current key is **Gemini free tier: 20 requests/day/model**. Testing exhausted `gemini-3.8-flash` (429) and the other models intermittently return 503. The chain falls through and the page degrades to the computed summary. A paid key removes the ceiling. |
| Live DB migration drift | known | 6 migrations exist in the live DB but not in the repo; the repo's `20261006010000_add_smart_entry_session` is absent from the live history although the table exists |
| Demo data | local only | seeded in the Docker dev DB; the live site was not touched |

---

## 6. Required credentials

1. `GEMINI_API_KEY` — needed in Vercel production (present locally). **Upgrade
   from the free tier** before real use: the free tier allows 20 requests per
   day per model, which the tests alone can exhaust.
2. Supabase database password — required to apply the delta (or explicit
   approval to run the DDL).
3. GitHub write access — to push the branch and open the PR.
4. Vercel access — to set env vars and deploy.

**Rotate the secrets that were shared in chat:** the Supabase access token, the
Gemini API key and the GitHub PAT.

---

## 7. How to review locally

```
npx tsx scripts/seed-new-features.ts     # non-destructive demo data
npm run dev                              # http://localhost:3000
```

Log in as `sadatrehman2004@gmail.com` (owns all the data). Then open the ☰
drawer (top-right) → **Suppliers**, **Reminders**, **Insights**, **Growth plan**,
**Transactions**; the dashboard also shows the Reminders card.

Never run `test-foundation.ts` or `audit-data-integrity.ts` while the dev server
is in use — they wipe all tables.
