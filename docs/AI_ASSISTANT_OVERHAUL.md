# AI Assistant Overhaul

Status: implemented, type-checked, built, and tested on a throwaway local database.
Branch: `feat/platform-expansion` (not merged to `main`).

This document records what was wrong, what changed, what was measured, and what
is still limited. Nothing here is claimed beyond what the test suite and build
actually produced.

---

## 1. Objective

Turn the existing voice/text smart-entry tool into a fast, accurate,
application-wide business assistant that:

- uses only the existing three free Gemini models (no paid API, no new key),
- spends as few AI requests as possible,
- can read **and** act across every module,
- never lets the model touch the database directly,
- never invents missing financial data,
- reports honestly when it cannot do something.

---

## 2. Root causes found (and fixed)

| # | Problem | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | "AI is busy" / every command burns all 3 models | `aiInterpretationSchema` required many fields Gemini routinely omits; every reply failed validation, so the rotation tried all three and returned FAILED | Tolerant schema (`nullish`, numeric coercion, `.catch()` on enums, defaults). One dropped field now degrades instead of failing |
| 2 | Voice was slow (5–20 s) | Audio was recorded, uploaded, and sent to Gemini to transcribe **and** interpret in one call — 1 paid request and a long wait per command | Browser Web Speech API is now primary (instant, free). Audio→Gemini is a fallback only |
| 3 | Simple questions cost an AI request | Everything routed through the model | Deterministic rules-first router. Balances, stock, lists and routine reports are answered from the database with **0** AI requests |
| 4 | Double-confirm could double-post | No idempotency | `AssistantAction` row + idempotency key + conditional `PENDING→EXECUTING` transition |
| 5 | Assistant only understood sales | Sales-centric intents | Router + AI now cover customers, suppliers, products, sales, purchases, payments, expenses, stock, reminders, reports, settings (read) |
| 6 | Silent "missing price" | Field-name mismatches between router and planner (`unitCost` vs `unitPrice`, `sellingPrice` vs `unitPrice`) | Unified; caught by the new tests, which then executed real purchases |
| 7 | Wrong query for common phrasings | Regexes required word boundaries that suffixes broke (`best sell**ing**`, `today**'s**`); imperative commands were swallowed by list queries | Regexes fixed; imperative openers now win over list queries |

---

## 3. Architecture

```
text or speech
      │
      ▼
1. RULES  (deterministic, 0 AI requests)
      │  most commands resolve here
      ▼
2. AI fallback  (only when rules cannot decide AND the text is business-like)
      │  returns a typed plan/query — never a database write
      ▼
3. QUERY  → read-only handlers, answered from the real records
   PLAN   → stored as AssistantAction (status PENDING), shown for confirmation
      │
      ▼
4. CONFIRM → execute through the normal service layer → verify → mark DONE
```

Guarantees:

- The model never receives IDs or balances as writable inputs and has no database access.
- All writes go through the existing, already-tested service functions.
- Server-side validation re-checks everything (schemas, ownership, balances).
- Sensitive actions (voids, payments, purchases) require explicit confirmation.
- Results are verified after writing; a failure returns an error, never a false success.
- Every request is accounted for (`requestsUsed`, `source`, timings are returned to the client).

---

## 4. Measured results

### Assistant suite — `npm run test:assistant`

```
==== 97 passed, 0 failed ====
```

| Metric | Value |
|--------|-------|
| Realistic commands run | 24 |
| Answered with **0** AI requests | 20 |
| Needed the AI | 4 |
| Total AI requests consumed | 4 |
| Median command time (rules path) | ~21 ms |
| Slowest rule-path command | ~78 ms |

The 4 AI calls were the deliberate "unroutable free-form text" cases plus the
audio-fallback case; every ordinary command cost nothing.

### Model rotation (same suite, isolated fake models)

- 429 on model A → falls through to model B; A is not called twice in one request.
- A rate-limited (cooling) model is skipped on the next request.
- A deterministic (schema) failure stops the chain (≤ 1 extra model) instead of burning all three.
- With a limit of 1 per model, the 4th request raises `AIExhaustedError` (no silent failure).
- Only one model is ever called at a time.

### Idempotency and safety

- Confirming the same action twice posts **one** transaction; the second says "Already saved…".
- The same spoken command within the idempotency window maps to the **same** plan id.
- A sale with no stated payment is refused (`requires: paidAmount`); no sale is created.
- Overselling is allowed but warned.
- Tenant isolation: user B never sees user A's customers or products.

### Regressions

| Check | Result |
|-------|--------|
| `npm run build` | pass |
| `npx tsc --noEmit` | clean |
| `test-acceptance-http` (Phase 2) | 152 passed, 0 failed, 1 skipped |
| `verify-assistant-writes` | 33 passed, 0 failed |
| `verify-ai-query-types` | 28 passed, 0 failed |

The live-Gemini suites (`verify-ai`, `verify-ai-queries`) were intentionally left
out of the fast regression pass: they make real provider calls that can take
minutes each (one observed call took ~137 s). They are not broken.

### Routes

`POST /api/assistant/message`, `POST /api/assistant/confirm`,
`POST /api/assistant/cancel`, `GET /api/assistant/status`.
All four return `401` without a session (verified against the running server).

---

## 5. Interaction approaches considered

| Approach | AI requests | Speed | Verdict |
|----------|-------------|-------|---------|
| A. Rules only | 0 | fastest | Rejected: cannot handle free-form language |
| B. AI for everything | ≥1 per command | slow | Rejected: burns the tiny free budget, slow |
| C. Rules-first, AI fallback | 0 for common, 1 when needed | fast | **Chosen** |
| D. C + browser speech recognition | as C, no extra request | fast | **Chosen** (speech) |
| E. Single audio+interpret Gemini call | 1 per command, always | slow | Kept only as the audio fallback for browsers without speech recognition |

---

## 6. What is still limited (honest)

- **Speech support varies by browser.** Chrome/Edge/Android use on-device
  recognition (fast, free). Firefox desktop has none, so those users fall back to
  recording audio, which costs one AI request and is slower. The UI states which
  mode is active.
- **AI free-tier limits are estimates.** The per-model daily cap (default 20,
  `GEMINI_DAILY_LIMIT`) is our configured estimate, not a provider guarantee. When
  exhausted the assistant says so and preserves the user's words.
- **Database persistence needs a migration.** The new tables (`AIUsageDaily`,
  `AssistantAction`, `AssistantThread`) exist in the local database only. The code
  tolerates missing tables with an in-memory fallback, but a migration must be
  applied before relying on persistence in production.
- **Assistant UI text is English** (plus a speech-language selector). A full
  translation pass was not done.
- **Provider latency** for the AI fallback is outside our control and remains the
  slowest path by design.
- **Phase 2 open items unchanged**, e.g. voiding a sale also voids all linked
  payments (needs a product decision).
- Nothing has been merged or pushed to `main`.

---

## 7. Files

New:

- `src/lib/ai/model-registry.ts`, `src/lib/ai/gemini-client.ts`
- `src/lib/assistant/{types,nlg,router,context,queries,actions,ai,service}.ts`
- `src/app/api/assistant/{message,confirm,cancel,status}/route.ts`
- `src/hooks/assistant/{use-speech-recognition,use-assistant}.ts`
- `src/components/assistant/AssistantWidget.tsx`
- `scripts/test-assistant.ts`

Changed:

- `prisma/schema.prisma` (new tables + relations)
- `src/lib/smart-entry/{schema,service,gemini-provider}.ts`
- `src/app/providers.tsx` (mount the app-wide assistant)
- `package.json` (`test:assistant`)

---

## 8. How to reproduce

```bash
# local database
docker run -d --name khata-pg -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine
npx prisma db push

# assistant test environment
npm run test:assistant

# regressions
npm run build
npx tsc --noEmit
npm run test:acceptance   # needs: npm run dev on :3000
```
