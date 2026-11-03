# Khata Assistant — Business Intelligence

Status: implemented, type-checked, built, and tested against a real local
database (2026-11-03).

The **Khata Assistant** is a separate product from the **Universal Voice
Assistant**:

| | Universal Voice Assistant | Khata Assistant |
|---|---|---|
| Job | **Act** on the business | **Understand** the business |
| Input | microphone (or typed fallback) | tap a question or type one |
| Output | a confirmed plan, then a DB write | an explanation of real figures |
| Writes | yes, after confirmation | **never** |
| Launcher | bottom-right, `bottom-24 right-4` | beside it, `bottom-24 right-20` |

They have separate launchers, panels, endpoints, and conversation state. The
Khata Assistant cannot create, edit or void a record; asking it to do so returns
a pointer to the Voice Assistant or the matching screen.

---

## 1. The 20 prepared questions

Every question is tappable. Tapping runs the query immediately — there is no
form, and the owner never retypes a prepared question.

### A. Sales and revenue

1. How much have I sold today?
2. How much have I sold this month?
3. Which products are selling the most?
4. Which customers buy the most from me?
5. Are my sales increasing or decreasing?

### B. Customers and khata

6. Which customers owe me the most money?
7. How much money do customers owe me in total?
8. Which customers have not purchased recently?
9. Which customers have overdue outstanding balances?
10. Which customers should I contact for repeat orders?

### C. Stock and products

11. Which products are running low on stock?
12. Which products have the highest sales?
13. Which products are not selling?
14. What is the current value of my available inventory?

### D. Expenses and profit

15. How much have I spent this month?
16. What is my estimated net profit this month?
17. What are my biggest business expenses?
18. How much money have I actually received compared with my sales?

### E. Business performance

19. What are the biggest problems in my business right now?
20. What should I do to improve my sales and business performance?

The catalogue lives in `src/lib/khata-assistant/questions.ts` and is also served
by `GET /api/khata-assistant/questions?lang=en|ur|roman-ur`.

---

## 2. Where each answer comes from

No number is produced by an LLM. Each handler reads the same services the
screens use, scoped to the authenticated `userId`.

| Question | Primary source |
|---|---|
| Sold today / this month | `getReportForPreset(userId, "today" \| "month", tz)` |
| Top products | `saleItem.groupBy` over the last 30 days |
| Top customers | report `sales.byCustomer` |
| Sales trend | `getBusinessInsights` (month + week aggregates) |
| Who owes most / total owed | `listOutstandingCustomers` (opening + sales − payments + adjustments) |
| Not purchased recently | `customerRecency()` — last sale per customer, all customers |
| Overdue balances | `getRecoveryData(userId, "overdue")` + `getOverdueSummary` |
| Repeat-order candidates | `customerRecency()` — last purchase 14–60 days ago |
| Low stock | `listProductsWithStock` where `currentStock <= lowStockThreshold` |
| Highest sales products | `saleItem.groupBy` by revenue (30 days) |
| Not selling | products with stock > 0 and no sale in 30 days |
| Inventory value | `report.position.stockValue` (`stock × purchasePrice`, positive stock only) |
| Expenses | report `expenses.total` / `byCategory` |
| Net profit | `report.profit` = revenue − COGS − recorded expenses |
| Cash vs sales | report `sales.billed` vs `sales.cashReceived` + `position.receivables` |
| Problems / next steps | composite of overdue, payables, P&L, trend, low stock, dead stock |

### Financial definitions used

- **Revenue** = active sales `totalAmount` (net of discount).
- **COGS** = sale quantity × batch `unitCost`, falling back to the product
  `purchasePrice`. If neither exists, the UI says cost may be understated.
- **Gross profit** = revenue − COGS.
- **Recorded expenses** = active expenses in the period.
- **Estimated net profit** = gross profit − recorded expenses.
- **Cash received** = payments collected in the period — **not** the same as
  revenue when sales are on credit.
- **Receivables** = what customers owe (opening + sales − payments + adjustments).
- **Payables** = what the business owes suppliers.

Estimates are labelled as estimates. A missing cost is explained, never guessed.

---

## 3. Custom questions

Typed questions are routed in this order:

1. **Deterministic match** (`src/lib/khata-assistant/match.ts`) — weighted
   keyword matching across English, Urdu script and Roman Urdu. This covers the
   documented examples and costs nothing.
2. **AI classification** — only if the matcher cannot decide. The model returns
   one of the known question ids (or `unknown`); it never returns a number.
3. **Guidance** — if nothing matches, the owner gets a short list of topics to
   try. No figures are invented.

Examples that route without AI:

- “Why were my sales lower this week?” → sales trend
- “Which customers should I follow up with?” → repeat-order candidates
- “Which products should I purchase again?” → low stock
- “How much money should I collect from customers?” → total receivables
- “Compare this month with last month.” → month-over-month comparison
- “Which customers are becoming inactive?” → inactive customers
- “Kitna udhaar hai?” → total receivables

Action requests (“add customer Imran”, “record a sale”) are detected and
answered with: *“I only explain your business — I do not create or change
records. Use the Universal Voice Assistant (tap the microphone) or the matching
screen.”* No write occurs.

---

## 4. Language

There is no language-selection dropdown.

- **Prepared labels** are shown in the app language (English / Urdu) and can be
  served in Roman Urdu.
- **Answers** are produced from localised templates (English, Urdu, Roman Urdu).
- **Typed questions** are language-detected on the server from the text itself
  (Arabic script → Urdu; Roman-Urdu markers → Roman Urdu; mixed → mixed).
- If the AI is available, a typed answer may gain a short explanation **below**
  the computed headline, in the detected language. The deterministic headline
  and figures stay authoritative; the AI never replaces them and never adds a
  number. If the AI is unavailable, the deterministic answer is unchanged.

Honest scope: the Urdu and Roman-Urdu templates cover every headline and the
recurring figure labels. A few long explanatory notes fall back to English.
No claim is made that every phrasing is perfectly natural in every dialect.

---

## 5. AI cost control

- Prepared questions **never** call the AI. They are ordinary database reads.
- The deterministic matcher resolves most typed questions without AI.
- The AI is used only to (a) classify an unrecognised typed question and (b)
  add an optional explanation below an answer. Both use the existing three-model free-tier
  rotation (`src/lib/ai/gemini-client.ts`), so they share the same daily budget
  and cooldowns as the rest of the app.
- No new provider, key, paid API or subscription was added.
- Model names, quotas and counters are **not** in any answer or UI. They remain
  behind the secret-gated `/admin/diagnostics`.

---

## 6. Security and isolation

- `userId` comes from the signed session cookie via `requireActiveAccess`; it is
  never read from the request body.
- Every service call is tenant-scoped. The acceptance test creates a second
  tenant and confirms it cannot see the first tenant's customers or balances.
- `/api/khata-assistant/*` is protected by the existing middleware (not in the
  public allow-list).
- The engine imports no write-path module. A structural test asks it to add a
  customer and verifies the customer count is unchanged.

---

## 7. Empty and incomplete data

- No sales → “No sales have been recorded today/month yet.”
- No customers owing → “Customers do not owe you anything right now.”
- Unknown cost → the net-profit answer explains that cost of goods may be
  understated.
- No records at all → every prepared answer is marked empty and shows zero rows.
- The acceptance test runs all 20 questions against an empty tenant and asserts
  `empty === true` and `rows.length === 0` for each.

---

## 8. API

### `GET /api/khata-assistant/questions?lang=en|ur|roman-ur`

Returns categories and localised labels for the 20 questions.

### `POST /api/khata-assistant/ask`

```json
{ "questionId": "top_debtors", "language": "en" }
{ "text": "which customers owe me the most", "language": "en" }
```

Returns `{ ok: true, data: KhataAnswer }`:

```ts
type KhataAnswer = {
  kind: "answer";
  questionId: string | null;
  question: string;
  language: "en" | "ur" | "roman-ur" | "mixed";
  headline: string;
  explanation?: string;
  figures: { label: string; value: string; hint?: string }[];
  rows: { label: string; value?: string; meta?: string }[];
  notes: string[];
  nextStep?: string;
  empty: boolean;
  source: "database" | "database+ai";
  generatedAt: string;
};
```

Prepared questions are not rate-limited. Typed questions use the existing
per-user execute limiter so only AI-capable requests can consume budget.

---

## 9. UI

`src/components/khata-assistant/KhataAssistant.tsx`

- Launcher: `bottom-24 right-20`, aria-label **“Open the Khata Assistant”**,
  `BarChart3` icon.
- Title **“Khata Assistant”** and the description *“Understand your business
  from your own records.”*
- Five category headings with tappable question rows.
- Answer view: question, headline, 2-column figures, itemised rows, amber
  warning/limitation notes, next-step hint, and **“Ask another question”**.
- Custom input at the bottom with a send button.
- Loading state (“Checking your records…”), error state with **Try again** and
  **Back**.
- Mobile: full-width bottom sheet; desktop: 440 px card.
- No model names, counters, provider information or technical diagnostics.

---

## 10. Testing

`npm run test:khata` — **223 checks passed, 0 failed** (median 32 ms, slowest
162 ms, zero AI requests).

Verified:

- Exactly 20 questions in 5 categories, no duplicate ids.
- All 20 return a real answer; each has a headline and no developer details.
- Calculations match the seeded records and the report/P&L services:
  - receivables **Rs. 2,820**; overdue **Rs. 2,300**
  - inventory value **Rs. 23,600** across 4 stocked products
  - this-month expenses **Rs. 2,500** (last month's expense excluded)
  - net profit negative and equal to the P&L service
  - Rice is the top product by quantity (15 kg) and revenue (Rs. 4,500)
  - Ali Raza is the top customer and the top debtor
  - Sugar + Cooking Oil are low stock; Salt + Sugar are not selling
  - Kareem is inactive; Nadia is a repeat-order candidate
- Empty tenant: all 20 are marked `empty` with zero rows.
- Tenant isolation: a second tenant sees no debtors, no “Ali Raza”, zero
  receivables.
- Read-only: “add customer Imran Khan” creates nothing and points to the Voice
  Assistant.
- Custom routing: 10 English/Roman-Urdu questions route to the expected intent.
- Language: Urdu script detected; Roman Urdu detected; Urdu answer contains
  Arabic script; Roman-Urdu answer returned in Roman Urdu.
- Unknown question gets guidance, not an error, and no figures.

Also re-run unchanged:

- `npm run test:voice` — 53 passed
- `npm run test:assistant` — 112 passed
- `npm run build` — exit 0
- `npx tsc --noEmit` — clean

---

## 11. Honest limitations

- The answers are only as good as the recorded data. If sales, purchases or
  expenses are not entered, the assistant says so rather than estimating.
- COGS depends on purchase prices / batch costs. When they are missing, the
  profit answer warns that cost may be understated.
- “Not selling” uses a 30-day window and stock > 0. A seasonal product may
  appear there legitimately.
- “Repeat-order candidates” is a recency heuristic (14–60 days since last
  purchase), not a prediction.
- Prepared-question answers are template-localised. Some long notes remain in
  English in Urdu/Roman-Urdu mode.
- AI classification/re-wording is best-effort and subject to the free-tier
  quota. The deterministic path always works.
- This environment has no microphone or production data; the feature was tested
  with a throwaway tenant and the local database.

---

## 12. Files

New:

- `src/lib/khata-assistant/{types,questions,phrases,facts,match,ai,engine,service}.ts`
- `src/app/api/khata-assistant/ask/route.ts`
- `src/app/api/khata-assistant/questions/route.ts`
- `src/hooks/khata-assistant/use-khata-assistant.ts`
- `src/components/khata-assistant/KhataAssistant.tsx`
- `scripts/test-khata-assistant.ts`
- `docs/KHATA_ASSISTANT.md`

Changed:

- `src/app/providers.tsx` (mounts `KhataAssistant` instead of the old command
  chat)
- `package.json` (`test:khata`)

Removed:

- `src/components/assistant/AssistantWidget.tsx` — the old typed command chat.
  Its action role now belongs to the Universal Voice Assistant; the Khata
  Assistant is business intelligence only.

---

## 13. Reproduce

```bash
# local database (already used by the other suites)
npm run test:khata

# type-check + production build
npx tsc --noEmit
npm run build
```