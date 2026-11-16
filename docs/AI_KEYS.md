# AI keys and model rotation

There are two Gemini keys with different jobs. This is a billing boundary, not a
model difference — both keys run the same three-model rotation.

| Pool | Env var | Who spends it | Why |
| --- | --- | --- | --- |
| `user` | `GEMINI_API_KEY` | PREMIUM customers and 14-day TRIAL users | This is the key whose quota costs money. It is the one to fund/upgrade. |
| `owner` | `GEMINI_OWNER_API_KEY` | OWNER and AFFILIATE accounts | The owner tests voice constantly and must never burn a customer's daily budget. |

REGULAR (the Rs 10,000 one-time licence) and UNACTIVATED accounts never reach the
AI layer at all: `requireAiAccess` rejects them before a key is chosen.

## How the pool is chosen

`requireAiAccess()` (src/lib/auth/get-current-user.ts) resolves the eligibility
once per request, then binds the pool for that request with `AsyncLocalStorage`:

```
OWNER / AFFILIATE  → owner pool
PREMIUM / TRIAL    → user pool
everything else    → rejected
```

The low-level client (src/lib/ai/gemini-client.ts) and the usage counters
(src/lib/ai/model-registry.ts) read the bound pool. No client input can choose a
key, and no module may read a Gemini key directly — `npm run test:ai-keys` fails
the build if one does.

If `GEMINI_OWNER_API_KEY` is not set, owners fall back to the customer key and a
warning is logged. The owner experience never breaks because of a missing
second key.

## Model rotation (unchanged)

Both pools try the same models, strongest first:

1. `gemini-3.5-flash`
2. `gemini-3-flash-preview`
3. `gemini-3.1-flash-lite`

A model that is rate-limited or exhausted is parked, and the next request starts
at the next healthy model. Each pool keeps its own counters in `AIUsageDaily`
(stored as `user::<model>` and `owner::<model>`), so owner testing cannot make a
customer's model look exhausted. The daily limit per model defaults to 20 and can
be raised with `GEMINI_DAILY_LIMIT`.

## Changing keys

1. Update `GEMINI_OWNER_API_KEY` (or `GEMINI_API_KEY`) in `.env.local` for local
   development.
2. Update the same variable in Vercel for **Production, Preview and Development**
   (Project → Settings → Environment Variables).
3. Redeploy. Environment changes only reach running functions after a deploy.

## Checking which keys are configured

`GET /api/admin/diagnostics` (header `x-admin-secret`) returns booleans only:

```json
{
  "config": { "keys": { "user": true, "owner": true, "ownerDedicated": true } },
  "rotation":      { "pool": "user",  "models": [...] },
  "ownerRotation": { "pool": "owner", "models": [...] }
}
```

Key values are never returned, logged, or stored in the repo.

## Operational notes

- The owner key was shared in a chat message during setup. Rotate it in Google AI
  Studio when convenient and update Vercel + `.env.local` together.
- `GEMINI_API_KEY` is the customer key. When it is upgraded to a paid tier, only
  this variable changes; owners keep using the owner key.