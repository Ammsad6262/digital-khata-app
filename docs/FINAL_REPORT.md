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

### Share a sale receipt
- `buildSaleReceipt()` writes a numbered receipt from the **saved sale** — items,
  total, paid, and "Still to pay" / "Paid in full" / extra received — with the
  business name and notes.
- `ShareReceipt` on `/sales/[id]` opens WhatsApp pre-filled, plus Copy text.
  Voided sales do not offer a receipt; posted sales are corrected by voiding, not
  by editing, so history stays auditable.

### Reports for any period (`/more/reports`)
- Pick Today / This week / This month / Last month / Last 7 days / Last 30 days,
  or two dates. The server resolves them as calendar days in the business
  timezone and rejects reversed or over-long ranges.
- **Money in** shows sales billed and cash actually received; **Money out** shows
  purchases billed, cash paid to suppliers and recorded expenses. These are kept
  separate on purpose — a big sales figure is not cash.
- **Profit estimate** shows cost of goods, gross profit, recorded expenses and a
  net estimate with its margin, badged "Estimate".
- **Where you stand today** shows receivables, payables and stock value, labelled
  as today's position rather than the period's.
- **What this report does not know** lists the limitations that actually apply:
  the cost basis, unrecorded expenses, the point-in-time balances, invoiced vs
  paid, and — when relevant — sold lines with no purchase price. The dashboard
  P&L card carries the same caveat and links here.
- **Stock value has one definition**: positive on-hand quantity × each product's
  purchase price. Negative stock is ignored, and products in stock without a
  purchase price are shown as "not valued" rather than counted as zero. The
  stock screen shows the same figure with the method stated.
- **Compared with the previous period** shows the same-length window immediately
  before the selected one. A percentage appears only when the earlier window had
  a real figure; a zero baseline is never turned into a fake percentage.
- **How customers paid**, **who owes you**, **who you owe** and **low stock** are
  separate sections, each linked to the record it describes.
- **Sales by customer** and **purchases by supplier** break the period down
  without mixing "paid at purchase" with supplier payments recorded later.
- **Export CSV** is built from the same payload on screen, so the file cannot
  disagree with the report. It includes every section and the limitations.

### Due dates and overdue money
- A sale can carry an optional agreed payment date. It is stored as midnight in
  the business timezone, so "due today" is not overdue until tomorrow.
- A sale is overdue only when money is still owed **and** the date has passed.
  Fully paid, voided and undated sales are never counted.
- The sale form has a due-date field; the sale page and the sales list mark
  overdue sales; the khata customer page still shows the real balance.
- Insights and Reports show the overdue amount, how many sales and how many
  customers, from one shared `getOverdueSummary()` so the two screens can never
  disagree. The assistant answers "who is overdue?" with a tappable row per
  customer.

### Discounts on a sale
- A sale can carry a whole-sale discount. The customer is billed the item total
  minus the discount, and that billed total is what every screen, the khata
  balance, the receipt, profit and reports use.
- The discount is refused if it is negative or larger than the goods. Money
  taken at sale time can never exceed the discounted total.
- The sale page and the receipt show **before discount → discount → total**, so
  the line maths still adds up for the customer.
- Revenue is read from `Sale.totalAmount` (already discounted), so profit and
  reports can never silently count the pre-discount value. Reports also show
  the discounts given in the period, and say that top-product values are before
  the discount.

### Units are yours, not ours
- The app ships with sensible defaults (piece, kg, box, bag…), but a business
  can add its own unit in **Settings → Units** (tray, sack, gaddi, ton, …).
- The product form, the quick-add form inside a sale, and the assistant's
  product-creation form all read that list, so a custom unit is selectable
  everywhere — not only in Settings.
- Custom units are stored per business (`Setting.customUnits`). The assistant
  context was reading a global `"singleton"` row, so it never saw them; that is
  fixed and covered by a test.
- Editing an old product keeps its existing unit even if that unit is no longer
  in the list, so a rename can never silently change a product's unit.

### Printable receipt
- Every sale now has a clean receipt page at `/sales/<id>/receipt`, opened
  from **Print receipt** on the sale page. It shows the business name, customer,
  items, before-discount/discount/total, paid, still to pay, due date and notes.
- The page has no bottom navigation or floating buttons; the only toolbar (back
  and print) is hidden by the browser's print styles, so the paper is the page.
  It can be printed or saved as PDF without leaving the app.
- A voided sale shows a clear "not a valid receipt" notice. Figures come from
  the saved sale, never recalculated.

### Backup covers the whole business
- The JSON backup includes suppliers, purchases, purchase items, supplier
  payments, reminders and follow-ups — not just the original khata tables.
- Restoring keeps discounts, due dates, next-follow-up dates, purchase batches
  and supplier ledger links. Old backups still import with empty newer tables.
- Integrity checks run before anything is deleted, so a corrupt file cannot
  wipe the business.

### Follow-up workflow (`/more/follow-ups`)
- **Candidates come from purchase dates, not guesses.** A customer appears when
  the gap since their last purchase of a product is at least 1.25× their own
  average gap for that product; a customer who stopped buying everything is
  flagged separately. Fewer than two purchases, or a recent purchase, means no
  suggestion at all.
- Each card states the evidence ("Bought this 3 times — usually every 20 days,
  last one 35 days ago"), the live balance, and a **pre-written message the owner
  can edit before sending**.
- **Outcomes are recorded by the owner** — contacted / interested / order placed /
  not interested / no response — with first-contact and closed dates stamped
  automatically. Opening WhatsApp never counts as "contacted", and nothing is
  ever marked as sent.
- **Results**: contacted count, orders placed, and conversion %, all counted from
  what the owner recorded. "Order placed" links straight to a sale for that
  customer so stock and khata stay correct.
- Saving the same opportunity twice returns the existing one — duplicates are
  impossible. A closed follow-up frees the opportunity again.

### Payment recovery (`/more/recovery`)
- A collection list built from real open sales, highest priority first. It shows
  the outstanding balance, the overdue part, invoice count, days overdue, last
  payment and next reminder.
- Unlinked payments are allocated to the oldest open invoices **in memory for
  due-date purposes only**. The stored `Sale.outstanding` is never rewritten.
- Logging a contact is a completed `payment_collection` reminder and never
  changes a balance. Creating a reminder does not mark anyone as contacted.
- The pre-written WhatsApp message uses the real balance and due date; it does
  not invent a discount or a promise.

### Audit trail (`/more/audit`)
- Financial and master-data actions write a best-effort audit row after the
  business transaction commits: sales, payments, purchases, supplier payments,
  expenses, stock, products, customers, suppliers, settings, backup import,
  follow-up outcomes, recovery contacts and clear-all.
- Rows are scoped to the signed-in business and shown newest first. Audit logging
  never makes a successful business action fail.
- Clear-all keeps settings and audit history, and records `data.clear`.

### Billing foundation (no fake payment)
- `BILLING_ENABLED` defaults to **false**. While false, `hasActiveAccess()`
  returns true and `getSubscriptionStatus()` reports `BILLING_DISABLED` with no
  expiry pressure.
- The subscription screen says plainly that online payments are not connected,
  nothing will expire and every feature is available. No price, checkout or
  payment is simulated.
- The real trial and redemption-code flow remains in place for when billing is
  configured and explicitly enabled.

### Faster lists and editable customers
- Sales search by customer, phone, sale ID or amount, with unpaid / partial /
  paid / overdue filters.
- Payments search by customer, phone or payment ID, with payment-method filters.
- Expenses search by name, note or category, with category filters.
- Customers sort by name, highest balance or lowest balance.
- Customers can be edited at `/khata/<id>/edit`, including an optional shop /
  company name. Opening balance stays fixed (use an adjustment), so history
  remains auditable.

### Voice / text assistant
- Read queries: expenses, sales + cash received (respecting today / week / month),
  customer balances (one named customer, or everyone who owes), stock level, low
  stock, supplier payables, purchases from a named supplier, reminders due today,
  customers who stopped buying, and customers ready to reorder.
- Answer rows that point at a record are **tappable** — the assistant opens the
  customer, product, supplier or follow-up page directly.
- Write intents: `CREATE_CUSTOMER`, `CREATE_PRODUCT`, `CREATE_EXPENSE`,
  `SUPPLIER_PAYMENT`, `CREATE_REMINDER`, `CREATE_PURCHASE` — confirmation-first,
  model never supplies IDs or prices (all resolved server-side).
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
| `scripts/verify-ai-gating.ts` | AI entitlement gate; with billing disabled, expired accounts are intentionally allowed through, and invalid tokens still get 401 | 8/8 |
| `scripts/verify-assistant-writes.ts` | voice write-path extraction | 33/33 |
| `scripts/verify-ai-queries.ts` | live Gemini routing | 5/5 |
| `scripts/verify-contact-actions.ts` | phone normalisation, Call/WhatsApp links, reminder enrichment, snooze, supplier reorder | 36/36 |
| `scripts/verify-statement.ts` | WhatsApp khata statement: exact balance, entry order, advance/settled wording, Urdu | 19/19 |
| `scripts/verify-follow-ups.ts` | follow-up candidates from real purchase dates, duplicate prevention, editable message, outcome + conversion maths, tenant isolation | **50/50** |
| `scripts/verify-ai-query-types.ts` | every assistant query type against real records: balances, today's cash, low stock, supplier purchases, inactive + reorder + overdue customers | **28/28** |
| `scripts/verify-receipt.ts` | sale receipt text: saved totals, paid/outstanding wording, overpayment, notes, Urdu, no profit language | **26/26** |
| `scripts/verify-reports.ts` | any-period report: inclusive window, presets, sales / cash / purchases / expenses / COGS / profit, stock valuation rule, point-in-time position, comparison window, payment methods, balance lists, low stock, customer/supplier breakdowns, limitations, tenant isolation | **61/61** |
| `scripts/verify-due-dates.ts` | due date stored as business-timezone midnight, overdue rule, paid/voided/no-date exclusions, insights + reports + sales list agreement, assistant overdue answer, tenant isolation | **30/30** |
| `scripts/verify-discounts.ts` | discounted billed total, full and zero discount, negative/over-total/over-paid refusals with no partial writes, receipt wording, revenue + report + khata agreement, tenant isolation | **36/36** |
| `scripts/verify-units.ts` | custom units saved per business, reachable by the assistant, usable on a product, visible on the stock list, never shared across businesses | **9/9** |
| `scripts/verify-backup.ts` | every business table exported/restored, old-format backups, integrity guard, no double counting | **39/39** |
| `scripts/verify-recovery.ts` | recovery list from real open sales, unlinked-payment allocation, filters, contact log, reminder, message, tenant isolation | **42/42** |
| `scripts/verify-audit.ts` | audit rows for every financial action, real totals in metadata, tenant isolation, clear-all retention | **27/27** |

Total: **590 assertions recorded across all suites**. After the latest changes,
**524 assertions were re-run with 0 failures** (the live Gemini suites were not
re-run because the free-tier quota is exhausted). `npx tsc --noEmit` and
`npm run build` are clean.

The 10 acceptance workflows: register+trial · add customer · credit sale (stock
and ledger move) · record payment · record expense · add stock · buy from
supplier on credit · pay supplier (overpay rejected) · create+complete reminder
· insights + growth + gating.

---

## 4. Database changes

New models: `Supplier`, `Purchase`, `PurchaseItem`, `SupplierPayment`,
`Reminder`, `FollowUp`, `AuditLog`.
New columns: `Customer.nextFollowUpAt`, `Customer.companyName`,
`Supplier.nextFollowUpAt`, purchase totals (`totalAmount`, `paidAmount`,
`outstanding`), purchase-item lines, supplier/reference links on ledger rows,
`Sale.dueDate` and `Sale.discountAmount`.
Uniqueness: `@@unique([userId, phone])` on `Customer`,
`@@unique([sku, userId])` on `Product` (per-tenant, not global).

Production DDL: `prisma/production/20261020_stage2_3_delta.sql` (suppliers,
purchases, reminders), `prisma/production/20261023_follow_ups.sql` (the
`FollowUp` table), `prisma/production/20261023_sale_due_date.sql` (sale due
dates), `prisma/production/20261023_sale_discount.sql` (sale discounts),
`prisma/production/20261024_audit_log.sql` (audit trail) and
`prisma/production/20261024_customer_company.sql` (optional shop/company name)
— all additive, transactional where relevant, idempotent. The stage 2-3 file
was applied twice to a scratch database and verified to produce a schema
identical to Prisma's.

No schema change was needed for the three new voice write intents.

---

## 5. Incomplete / blocked

| Item | Status | Blocker |
|---|---|---|
| Production deploy | not started | the six additive DDL files must be applied to Supabase (needs the DB password or approval to run DDL); `GEMINI_API_KEY` must be added to Vercel |
| Push `main` / open PR | deliberately not done | waiting for your review + the production delta |
| Billing / paid tier | intentionally off | `BILLING_ENABLED` defaults to false, so no feature is paywalled and no payment is simulated. The trial + redemption-code foundation remains; enabling billing requires a real provider. |
| Forgot-password / reset | does not exist | `PATCH /api/account/password` requires the current password; a reset flow needs an email provider or an admin-issued reset code decision |
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
**Reports**, **Transactions**; the dashboard also shows the Reminders card.

Never run `test-foundation.ts` or `audit-data-integrity.ts` while the dev server
is in use — they wipe all tables.
