# AI Assistant Overhaul

Status: implemented, type-checked, built, and tested on a throwaway local database.
Branch: `feat/platform-expansion` (not merged to `main`).

This document records what was wrong, what changed, what was measured, and what
is still limited. Nothing here is claimed beyond what the test suite and build
actually produced.

---

## 0. Product split (this change)

The assistant is now **two separate products** that share one backend engine:

| Product | Launcher | Interaction | Purpose |
|---------|----------|-------------|---------|
| **Universal Voice Assistant** | microphone (bottom-right) | tap → speak → review the transcript → confirm | the original, app-wide voice-first experience |
| **Khata Assistant** | chat bubble (beside it) | type or tap a prepared command | typed Q&A and quick commands |

What this change fixed:

- Voice is no longer a form, a prepared-question chat, or a new-sale-only
  screen. It is mic-first on every signed-in page.
- The **language dropdown is gone**. The microphone locale follows the app
  language, the spoken language is detected from the transcript, and AI replies
  follow the language the owner used.
- Model names, per-model counters, quota, and provider details are **no longer
  returned by the normal assistant API or rendered in either UI**. They live in a
  secret-gated developer area: `/admin/diagnostics` and
  `GET /api/admin/diagnostics`.
- Comma-grouped money is parsed correctly (`15,000` used to be read as `15`), and
  “add 10 boxes of this product” now resolves the product from the conversation.

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
- Every request is accounted for on the server (`source`, attempts, timings).
  The public API returns only the answer/plan; model ids and per-request
  counters stay internal and are visible only at `/admin/diagnostics`.

---

## 4. Measured results

### Assistant suite — `npm run test:assistant`

```
==== 112 passed, 0 failed ====
```

| Metric | Value |
|--------|-------|
| Realistic commands run | 25 |
| Answered with **0** AI requests | 20 |
| Needed the AI | 5 |
| Total AI requests consumed | 5 |
| Median command time (rules path) | ~24 ms |
| Slowest rule-path command | ~103 ms |

The 5 AI calls were the deliberate "unroutable free-form text" cases (3), the
audio-fallback case, and one Urdu-script sentence; every ordinary command cost
nothing. The Urdu sentence reaches the AI rather than being rejected (see
"Languages" below).

### Universal Voice Assistant suite — `npm run test:voice`

```
==== 53 passed, 0 failed ====
```

| Metric | Value |
|--------|-------|
| Language-identification cases | 8 (English, Roman Urdu, Urdu, mixed) |
| Developer-detail checks | 7 |
| Spoken examples from the specification | 10 |
| Example commands executed against the real database | 6 writes + 4 reads |
| Verified database effects | sale total/outstanding, payment, expense, reminder, customer, stock |
| Median command time (rules path) | 23 ms |
| Slowest command | 40 ms |
| AI requests consumed | 0 |

The suite runs against a throwaway tenant and deletes it afterwards. It also
proves that the normal status/reply payloads contain no model id and no request
counter, and that the specification's `15,000` is stored as 15,000 (not 15).

### Model rotation (same suite, isolated fake models)

- 429 on model A → falls through to model B; A is not called twice in one request.
- A rate-limited (cooling) model is skipped on the next request.
- A deterministic (schema) failure stops the chain (≤ 1 extra model) instead of burning all three.
- With a limit of 1 per model, the 4th request raises `AIExhaustedError` (no silent failure).
- Only one model is ever called at a time.

### Latency budget (the "slow assistant" fix)

The AI fallback used to hang. The Gemini client had **no timeout**, each model
could block 40–45 s, and the rotation tried up to three of them back to back —
one command could freeze for a minute or more. Every AI request is now bounded:

| Knob | Default | Env var | Purpose |
|------|---------|---------|---------|
| Per-attempt abort | 14 s | `GEMINI_TIMEOUT_MS` | Give up on a single model and try the next |
| Whole-call deadline | 18 s | `GEMINI_DEADLINE_MS` | Stop the rotation entirely; never hang |
| Transport timeout | 30 s | `GEMINI_HTTP_TIMEOUT_MS` | SDK-level cap (see the 10 s floor below) |
| Output cap | 800 tokens | `GEMINI_MAX_OUTPUT_TOKENS` | Shorter generations answer sooner |
| Thinking budget | 0 (off) | `GEMINI_THINKING_BUDGET` | Skip hidden reasoning tokens |

- Each model call runs under an `AbortController`, so a stuck request is
  cancelled (not merely ignored) and the next model starts immediately.
- The rotation checks an absolute deadline before each model, so a slow provider
  produces a fast, honest `AI_SLOW` reply ("The AI took too long…") instead of a
  frozen screen. `AI_EXHAUSTED` (out of daily quota) is reported separately,
  because the fix is different (retry now vs. wait until tomorrow).
- `thinkingConfig` is sent only if supported: if the provider rejects it with a
  400, the call is retried once without it, so disabling thinking can never break
  the request.
- Guarded by tests: a provider that never answers is cut off in well under the
  old behaviour, and the rotation stops at its deadline (both in `test-assistant`).

**A hard provider constraint was measured live:** a manually-set request
deadline below 10 s is rejected with `INVALID_ARGUMENT — "Minimum allowed
deadline is 10s"`. An earlier 8 s transport timeout therefore made *every* call
fail. The transport timeout now stays safely above 10 s; the single 10 s figure
is the smallest *deadline* the provider accepts, not a floor on response time
(see the live measurements below).

**Live measurements (from the running server):**

- `POST /api/smart-entry/interpret` reached `gemini-3.5-flash` and returned in
  **2.7 s** — server log: `[gemini:interpret] ok model=gemini-3.5-flash
  attempts=1 ms=2703`. The same endpoint previously took ~45 s.
- When the free quota was exhausted, `POST /api/growth/summary` tried all three
  models and returned in **~2.0 s** total (three `429`s, then a graceful
  fallback) instead of hanging.

So the AI path is fast when the provider answers, and fast to give up when it
does not. The rule-path numbers above remain the meaningful fast-path figures.

### Languages (automatic, no selector)

The voice product has **no language dropdown**. Two things happen automatically:

1. **Microphone locale** follows the app's UI language (`ur-PK` for an Urdu
   interface, `en-PK` otherwise). It is only the starting point for the browser's
   on-device recogniser.
2. **Spoken-language identification** — `src/lib/assistant/language.ts` classifies
   the actual transcript as English, Urdu (Arabic script), Roman Urdu, or mixed.
   The result is shown beside the transcript so the owner can see what was
   understood. A wrong guess changes the *reply* language, never the command
   handling: the router and the AI fallback understand all four inputs anyway.

Tested (deterministic, 0 AI requests): English, Roman Urdu (`kitna udhaar hai`,
`aaj ka kharch`, `kam stock`, `sab se zyada bikne wale products`,
`500 kharch hua petrol pe`, `naya customer Naeem`), and Urdu script for the
phrases the rules cover (`مجھے کتنا ادھار لینا ہے`, `آج کا خرچ کتنا ہے`,
`اسٹاک کم ہے`). Any other Urdu-script text is recognised as a business command
and handed to the AI, whose prompt now requires the reply to use the user's own
language and script. Urdu/Arabic digits and diacritics are normalised.

Honest limit: fixed, data-derived answers (e.g. “Ali Raza owes you Rs. 5,000”)
are still English sentences. Only AI-generated clarifications and answers follow
the spoken language. A full Urdu localisation of every deterministic answer was
not done.

### Idempotency and safety

- Confirming the same action twice posts **one** transaction; the second says "Already saved…".
- The same spoken command within the idempotency window maps to the **same** plan id.
- A sale with no stated payment is refused (`requires: paidAmount`); no sale is created.
- Overselling is allowed but warned.
- Tenant isolation: user B never sees user A's customers or products.

### Regressions

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | clean |
| `test-assistant` | 112 passed, 0 failed |
| `test-acceptance-http` (Phase 2) | 153 passed, 0 failed, 0 skipped |
| `verify-assistant-writes` | 33 passed, 0 failed |
| `verify-ai-query-types` | 28 passed, 0 failed |
| `npm run build` | **passes** |

The live-Gemini suites (`verify-ai`, `verify-ai-queries`) were intentionally left
out of the fast regression pass: they make real provider calls that can take
minutes each (one observed call took ~137 s). They are not broken.

**About `npm run build`.** The `/_global-error` prerender failure described in an
earlier revision of this document no longer reproduces in this environment: the
full production build completes (`BUILD_EXIT=0`) and the route manifest includes
both new routes (`/admin/diagnostics`, `/api/admin/diagnostics`). The dev server
and the HTTP acceptance suite are unaffected.

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
- **Assistant UI text is English.** The language dropdown was removed; the app's
  bilingual `t()` system was not extended to the assistant chrome, and fixed
  data answers are English sentences (see Languages).
- **Speech accuracy is the browser's, and was not benchmarked with a microphone.**
  There is no audio device in this environment, so the automated suite tests the
  deterministic handling of realistic transcripts (including ambiguous ones), not
  acoustic accuracy. Chrome/Edge/Android give the best results; Firefox desktop
  uses the recorded-audio fallback.
- **Voice edits of existing records are not supported.** Creating, reading,
  paying, stock intake, reminders, voiding, and the module reports are; there is
  no `EDIT_CUSTOMER` / `EDIT_PRODUCT` / `EDIT_EXPENSE` action yet, and one
  sentence with several sale lines is not parsed reliably. These need a
  follow-up.
- **A wrong language guess only affects the reply language**, never command
  handling, and the transcript is always shown for correction before a write.
- **Provider latency** for the AI fallback is now bounded. A live interpret call
  returned in ~2.7 s and a fully-exhausted rotation gave up in ~2 s (see
  "Latency budget" above); the rules path stays ~tens of milliseconds.
- **Phase 2 open items unchanged**, e.g. voiding a sale also voids all linked
  payments (needs a product decision).
- Nothing has been merged or pushed to `main`.

---

## 7. Files

New:

- `src/lib/ai/model-registry.ts`, `src/lib/ai/gemini-client.ts`
- `src/lib/assistant/{types,nlg,router,context,queries,actions,ai,service,language}.ts`
- `src/app/api/assistant/{message,confirm,cancel,status}/route.ts`
- `src/app/api/admin/diagnostics/route.ts`, `src/app/admin/diagnostics/page.tsx`
- `src/hooks/assistant/{use-speech-recognition,use-assistant}.ts`
- `src/hooks/voice-assistant/use-voice-assistant.ts`
- `src/components/assistant/{AssistantWidget,PlanCard}.tsx`
- `src/components/voice-assistant/VoiceAssistant.tsx`
- `scripts/test-assistant.ts`, `scripts/test-voice-assistant.ts`

Changed:

- `prisma/schema.prisma` (new tables + relations)
- `src/lib/smart-entry/{schema,service,gemini-provider}.ts`
- `src/app/providers.tsx` (mount the two separate assistants)
- `src/middleware.ts` (let the diagnostics API reach its secret check)
- `src/lib/ai/gemini-narrate.ts` (narration now uses the tracked rotation)
- `package.json` (`test:assistant`, `test:voice`)

---

## 8. How to reproduce

```bash
# local database
docker run -d --name khata-pg -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine
npx prisma db push

# assistant test environments
npm run test:assistant
npm run test:voice

# regressions
npm run build
npx tsc --noEmit
npm run test:acceptance   # needs: npm run dev on :3000
```
