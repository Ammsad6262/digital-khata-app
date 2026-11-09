# Commercial Licensing — Technical Handover

Status: **implemented and verified on an isolated branch/worktree. Not committed,
pushed, merged or deployed.** Licensing enforcement is **off by default**
(`LICENSING_ENFORCED=false`); row-level security is opt-in via
`LICENSING_RLS_ROLE=khata_app`.

This document is for the developer who will integrate, deploy or extend the
commercial licensing system. It describes what was built, how access is decided,
how the AI workstream should consume the entitlement contract, and what is still
deliberately out of scope.

---

## 1. Scope

The work adds a **category-based commercial licensing layer** on top of the
existing Dukhata app:

- customer categories: regular, premium, affiliate, owner (plus unactivated),
- redeem codes for product activation, premium renewal and affiliate grants,
- a central, server-side **entitlement service** that is the single source of
  truth for access,
- an admin area for codes, customers, subscriptions and owners,
- minimal customer-facing activation/status UI,
- forward-only, versioned Prisma migrations.

It **does not** replace or duplicate the existing auth, customer, sales, stock,
purchasing, expense, backup or audit systems. The existing `User`,
`UserSubscription`, `RedeemCode`, `RedeemCodeRedemption` and `ADMIN_SECRET`
infrastructure is reused and extended.

It **does not** modify any AI code: Voice Assistant, STT, prompts, Khata
Assistant, premium AI tools or AI usage accounting. The entitlement service
exposes a contract for the AI developer, but no AI feature reads it yet.

---

## 2. Isolation performed

| Item | Value |
| --- | --- |
| Source repo | `C:\Users\sadat\dev\digital-khata-app` |
| Branch created from | `b4ef1f0` (`feat/platform-expansion`) |
| New branch | `feat/commercial-licensing` |
| Worktree | `C:\Users\sadat\dev\digital-khata-app-licensing` |
| Local database | `khata_licensing` on the existing `khata-pg` container (`localhost:5433`) |
| Local port | `3001` (the existing instance keeps `3000`) |
| Worktree `.env` | gitignored; `DATABASE_URL`/`DIRECT_URL` point at `khata_licensing`, `APP_URL=http://localhost:3001`, `LICENSING_ENFORCED=false`, `LICENSING_RLS_ROLE=khata_app` |

The main repo and its database were not modified. All tests ran against the
isolated database. Nothing was committed or pushed.

---

## 3. Business rules (exact)

| Category | Price | Duration | Access |
| --- | --- | --- | --- |
| Regular | PKR 10,000 one-time | permanent | core product only, **no AI** |
| Premium | PKR 3,000 / month | 30 days, renewable | core + premium (AI) |
| Affiliate | — | permanent | core + premium, **max 10 codes** |
| Owner | — | permanent | full access, **max 2 accounts** |
| Trial (legacy) | — | 30 days | core only, **no AI**; temporary, not a paid product |

Rules enforced in code:

- A **product** code activates permanent core access and never grants premium.
  A user on the 30-day trial may redeem it to upgrade; an already-paid core
  cannot be activated twice.
- A **premium** code requires an already-activated **paid** core product (not a
  trial). It adds 30 days to the current premium expiry if premium is still
  running, otherwise it starts 30 days from now. It never reactivates a revoked
  *code*.
- An **affiliate** code grants permanent core + premium to the redeemer.
- Owners and affiliates are already permanent; they cannot redeem product,
  premium or affiliate codes (the API rejects it).
- The existing 30-day trial is preserved as a **core-only** trial. It expires,
  does not grant AI/premium, and can be upgraded with a product code. New
  registrations and existing active trials receive this state.
- At most **10 affiliate codes** may ever be generated (server + DB-serialised),
  not only in the UI.
- At most **2 active owners**. The last owner cannot be revoked. Owner status is
  only grantable through the secret-gated admin API.
- Pricing is not encoded in the app. There is no payment provider: codes are
  issued by the owner after an off-platform payment.

---

## 4. Architecture

```
Customer UI                         Admin UI
/more/redeem                        /admin/licensing
/more/subscription                  /admin/codes (link)
        │                                   │
        │  fetch (JWT cookie)               │  fetch (x-admin-secret)
        ▼                                   ▼
/api/licensing                      /api/admin/licensing/codes
/api/subscription/redeem            /api/admin/licensing/customers
/api/subscription/history
        │                                   │
        └───────────────┬───────────────────┘
                        ▼
        src/lib/services/entitlement.ts   ← single source of truth
                        │
                        ├── computeEntitlement()   pure, testable
                        ├── getEntitlement()       DB read
                        ├── redeemLicenseCode()    atomic redemption
                        ├── generateLicenseCodes() admin issuance
                        ├── grant/revoke owner/affiliate/core/premium/access
                        └── getLicensingOverview()
                        │
                        ▼
        UserSubscription + RedeemCode + RedeemCodeRedemption + AuditLog
```

Key files:

| File | Purpose |
| --- | --- |
| `src/lib/services/entitlement.ts` | All entitlement logic, redemption, code issuance, admin actions, trial-aware derivation |
| `src/lib/db/prisma.ts` | Prisma singleton + `withUserRls()` (transaction-local `SET LOCAL ROLE` + `app.user_id` for enforced RLS) |
| `src/lib/services/subscription.ts` | Existing service; delegates `redeemCode`, `hasActiveAccess`; preserves the trial as core-only; fixes legacy code duration; adds `licensing`/`licensingEnforced` to the legacy status view |
| `src/lib/services/auth.ts` | Minimal change: registration creates the 30-day trial with the core-trial fields |
| `src/lib/services/audit.ts` | Added `licensing.affiliate_revoke` and `licensing.core_revoke` actions |
| `src/app/api/licensing/route.ts` | `GET` the signed-in customer's entitlement |
| `src/app/api/subscription/redeem/route.ts` | Existing redeem endpoint (now category-aware via the service) |
| `src/app/api/admin/licensing/codes/route.ts` | Admin: list / generate / revoke codes |
| `src/app/api/admin/licensing/customers/route.ts` | Admin: overview + owner/premium/access actions |
| `src/hooks/use-licensing.ts` | Customer entitlement query + redeem mutation |
| `src/app/more/redeem/page.tsx` | Activation + status + history |
| `src/app/more/subscription/page.tsx` | Added licensing status card |
| `src/app/admin/licensing/page.tsx` | Full admin area |
| `src/middleware.ts` | `/api/admin/licensing` added to the secret-gated public allowlist |
| `src/lib/i18n/translations.ts` | `licensing.*` and `api.licensing.*` keys (English + Urdu) |

---

## 5. Entitlement derivation

`computeEntitlement(userId, subscriptionRow, now)` derives everything from one
`UserSubscription` row. It performs no I/O and is safe to unit test.

```
accessRevoked   = accessRevokedAt != null
isOwner         = ownerGrantedAt != null && ownerRevokedAt == null && !accessRevoked
isAffiliate     = affiliateGrantedAt != null && affiliateRevokedAt == null && !accessRevoked
coreTimeValid   = coreExpiresAt == null || coreExpiresAt > now
coreActive      = !accessRevoked
                  && (isOwner || isAffiliate
                      || (coreActivatedAt != null && coreRevokedAt == null && coreTimeValid))
coreIsTrial     = !isOwner && !isAffiliate && coreExpiresAt != null
trialActive     = coreActive && coreIsTrial
premiumActive   = (isOwner || isAffiliate
                  || (premiumExpiresAt > now && premiumRevokedAt == null && !accessRevoked))
                  && coreActive && !coreIsTrial
category        = OWNER > AFFILIATE > PREMIUM > TRIAL > REGULAR > UNACTIVATED
```

Consequences:

- `coreExpiresAt == null` means **permanent paid core**. A date means the
  **30-day trial**; it expires on that date.
- A trial is `TRIAL`: core access is active, premium/AI is not. It can be
  upgraded with a product code, which clears `coreExpiresAt`.
- An expired trial is `UNACTIVATED`, but `core.trial` stays `true` so the UI can
  show "Trial ended" rather than a generic "not activated".
- A premium customer requires an active **paid** core (a trial is not enough).
  An expired premium customer is immediately `REGULAR` (core retained).
- An owner/affiliate stays premium even after `revokePremium`, because their
  premium is permanent.
- A global `revokeAccess` disables everyone, including owners; owners must be
  demoted first through the guarded owner endpoint.
- Expiry is evaluated server-side on every read. A stale browser cannot keep
  premium alive.

---

## 6. Code lifecycle

```
generate (admin) ──► plaintext returned ONCE ──► only SHA-256 hash stored
      │
      ├─ PRODUCT   durationDays=0, maxRedemptions=1
      ├─ PREMIUM   durationDays=30, maxRedemptions=1
      └─ AFFILIATE durationDays=0, maxRedemptions=1, global cap 10
      │
      ▼
redeem (customer, atomic) ──► RedeemCodeRedemption + subscription update
      │
      ├─ code inactive / revoked / expired / already used ──► rejected
      ├─ PRODUCT when a paid core is already active ─────────► rejected (trial may upgrade)
      ├─ PREMIUM without an active paid core ────────────────► rejected (trial is not enough)
      └─ AFFILIATE when already affiliate/owner ─────────────► rejected
      │
      ▼
revoke (admin) ──► only unused codes; redeemed codes are not silently undone
                   (revoke the customer's entitlement instead)
```

- Codes use the alphabet `ABCDEFGHJKLMNPQRTUVWXYZ2346789` (no ambiguous
  `0/O/1/I`), 12 random characters, prefixed `DKH-P-…` / `DKH-M-…` / `DKH-A-…`.
- Only the hash is persisted; listings never return plaintext or the hash.
- Redemption is a single Prisma transaction. The `redemptionCount` increment is
  a conditional `updateMany` (`redemptionCount < maxRedemptions`), so two
  simultaneous requests cannot both consume a one-time code.
- Affiliate generation takes a PostgreSQL transaction-scoped advisory lock and
  then counts existing affiliate codes, so the 10-code cap also holds under
  concurrency.

---

## 7. Customer flows

### Product activation (regular, PKR 10,000)
1. Owner generates a `PRODUCT` code and sends it to the customer.
2. Customer opens **More → Redeem code**, enters the code.
3. Server sets `coreActivatedAt` and clears `coreExpiresAt`. Category becomes
   `REGULAR`. Premium stays off.
4. A customer on the 30-day trial can upgrade; a paid core cannot be activated
   twice; owners/affiliates cannot redeem product codes.

### 30-day trial (legacy, preserved)
1. Registration creates a trial with `coreActivatedAt = now` and
   `coreExpiresAt = now + 30 days`.
2. Category is `TRIAL`: core business features work, AI/premium does not.
3. After expiry the category becomes `UNACTIVATED`; data is retained and the UI
   shows that the trial ended.
4. A product code upgrades the trial to permanent core.

### Premium (PKR 3,000 / 30 days)
1. Customer must already have a **paid** core product (a trial is not enough).
2. Redeem a `PREMIUM` code → 30 days added.
3. Renewing while active extends from the existing expiry; renewing after expiry
   starts from now.
4. Expiry is visible on `/more/redeem` and `/more/subscription`.

### Affiliate
1. Owner generates one of the (at most) 10 affiliate codes.
2. Customer redeems it → permanent core + permanent premium.
3. Affiliate status does not grant owner status.

### Owner
1. Owner (or whoever holds `ADMIN_SECRET`) opens `/admin/licensing`.
2. **Customers → Make owner**. Server enforces max 2 and records the grant.
3. **Remove owner** requires confirmation and refuses to remove the last owner.

---

## 8. Admin flows (`/admin/licensing`)

The page is protected by the existing `x-admin-secret` header (`ADMIN_SECRET`,
constant-time compare, minimum 16 characters). It is not a customer account.

- **Codes**: choose type, count, optional note; generate; copy the plaintext
  codes once; see used/unused/revoked status; revoke unused codes. Each code also
  shows **who redeemed it and when**. The affiliate counter shows how many of the
  10 remain.
- **Customers**: category badge (including Trial), core status/expiry, premium
  status/expiry, revocation state, and an **activation & renewal history** per
  customer (kind, resulting premium expiry, date); make/remove owner; revoke
  premium; remove affiliate; revoke core; revoke/restore all access.
- **Subscriptions**: active premium, expired premium (core retained), expiring
  within 7 days, trial and unactivated counts, plus a **recent activations &
  renewals** feed across all customers.

The legacy `/admin/codes` page remains for password reset and legacy code
listing, and links to the new area. It can no longer mint arbitrary-duration
codes: the service forces **30 days** and `kind = PREMIUM`, so those codes
require a paid core and cannot bypass the premium rule.

---

## 9. Database

### Schema changes (all additive)

`UserSubscription` gained:

```
coreActivatedAt, coreExpiresAt, coreRevokedAt
premiumStartedAt, premiumExpiresAt, premiumRevokedAt
affiliateGrantedAt, affiliateRevokedAt
ownerGrantedAt, ownerRevokedAt
accessRevokedAt, accessRevokedReason
```

`coreExpiresAt` is the trial boundary: `NULL` = permanent paid core; a date =
the 30-day trial core.

`RedeemCode` gained `kind` (default `PREMIUM`), `label`, `revokedAt`,
`revokedBy`, and an index on `kind`.

`RedeemCodeRedemption` gained `kind` (default `PREMIUM`).

No existing column, row, relation or business table was removed or renamed.
Existing duration codes map to `PREMIUM` and keep their `durationDays`.

### Backfill / trial policy

The third migration (`20261109160000_add_core_trial_expiry`) is a one-time,
idempotent data migration:

- any row with a non-NULL legacy `accessExpiresAt` is grandfathered: permanent
  `coreActivatedAt`, `coreExpiresAt = NULL`, and premium until the legacy expiry.
  This prevents existing paying customers from being locked out when enforcement
  is turned on.
- any row with a future legacy `trialExpiresAt` and no paid access becomes a
  core-only trial (`coreActivatedAt = trialStartedAt`,
  `coreExpiresAt = trialExpiresAt`).
- users with no paid access and an expired trial stay `UNACTIVATED`.

The business decision: the trial is core-only. It does not grant AI/premium and
is not a substitute for the Regular product.

### Migrations

- `prisma/migrations/20261109151410_add_commercial_licensing/` — columns + index.
- `prisma/migrations/20261109153000_add_licensing_rls/` — enables RLS on the
  user-owned `UserSubscription` and `RedeemCodeRedemption` tables.
- `prisma/migrations/20261109160000_add_core_trial_expiry/` — adds
  `coreExpiresAt` and runs the grandfather/trial backfill.
- `prisma/migrations/20261109170000_enforce_licensing_rls/` — **makes RLS
  effective**: creates the restricted role `khata_app` (not owner, not superuser,
  `NOBYPASSRLS`), grants it the licensing-table access it needs, and creates
  per-user policies keyed on the `app.user_id` session variable. See §10.

### Row-level security (enforced)

RLS on `UserSubscription` and `RedeemCodeRedemption` is enforced for
**user-scoped** queries via a restricted role:

```
BEGIN;
  SET LOCAL ROLE khata_app;                              -- subject to RLS
  SELECT set_config('app.user_id', <userId>, true);      -- transaction-local
  -- policy: "userId" = current_setting('app.user_id', true)
COMMIT;
```

- The helper `withUserRls(userId, fn)` in `src/lib/db/prisma.ts` runs every
  user-scoped entitlement/subscription read and the redemption transaction this
  way, so the context is guaranteed to be on the same connection (safe under
  PgBouncer/Supavisor transaction pooling — the session-level `setUserContext()`
  is retained only for backwards compatibility and is no longer the enforcement
  mechanism).
- **Fail-closed**: an unset/empty `app.user_id` matches no row, and cross-user
  writes affect zero rows.
- Admin/system operations (`rawPrisma`) still connect as the owner and
  deliberately bypass RLS — that is the privileged path. **No `FORCE ROW LEVEL
  SECURITY`** is used, precisely so the admin path keeps working.
- Enforcement is switched on with `LICENSING_RLS_ROLE=khata_app`. With the
  variable unset the app runs as the owner and RLS is not filtered (pre-hardening
  behaviour) — this keeps the deploy safe if the role has not been provisioned.
- `npm run test:licensing-rls` proves the isolation (own rows only, cross-user
  write denied, empty context sees nothing, owner bypass intact).

### Production delta

`prisma/production/20261109_commercial_licensing.sql` is the additive,
idempotent equivalent for an existing database, including `coreExpiresAt`, the
grandfather/trial backfill, and the enforced-RLS role (`khata_app`) + policies. It
is **not** listed in `scripts/apply-production-ddl.mjs`, so a Vercel build will
not apply it. Applying it to production is a deliberate step.

### Rollback

The changes are additive, so a rollback only drops what this work added. It is
**destructive to licensing data** and should only be run after exporting it.

```sql
DROP INDEX IF EXISTS "RedeemCode_kind_idx";

ALTER TABLE "RedeemCode"
  DROP COLUMN IF EXISTS "kind",
  DROP COLUMN IF EXISTS "label",
  DROP COLUMN IF EXISTS "revokedAt",
  DROP COLUMN IF EXISTS "revokedBy";

ALTER TABLE "RedeemCodeRedemption" DROP COLUMN IF EXISTS "kind";

ALTER TABLE "UserSubscription"
  DROP COLUMN IF EXISTS "coreActivatedAt",
  DROP COLUMN IF EXISTS "coreExpiresAt",
  DROP COLUMN IF EXISTS "coreRevokedAt",
  DROP COLUMN IF EXISTS "premiumStartedAt",
  DROP COLUMN IF EXISTS "premiumExpiresAt",
  DROP COLUMN IF EXISTS "premiumRevokedAt",
  DROP COLUMN IF EXISTS "affiliateGrantedAt",
  DROP COLUMN IF EXISTS "affiliateRevokedAt",
  DROP COLUMN IF EXISTS "ownerGrantedAt",
  DROP COLUMN IF EXISTS "ownerRevokedAt",
  DROP COLUMN IF EXISTS "accessRevokedAt",
  DROP COLUMN IF EXISTS "accessRevokedReason";

-- RLS hardening (drop policies first, then the restricted role)
DROP POLICY IF EXISTS user_subscription_owner ON "UserSubscription";
DROP POLICY IF EXISTS redeem_code_redemption_owner ON "RedeemCodeRedemption";
ALTER TABLE "UserSubscription" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "RedeemCodeRedemption" DISABLE ROW LEVEL SECURITY;
DROP ROLE IF EXISTS khata_app;
```

Then delete the four migration folders and resolve the migration table, or restore
the previous schema from the pre-licensing commit. No existing business table,
row or column is touched by the rollback.

---

## 10. Security

| Requirement | Implementation |
| --- | --- |
| Never trust the frontend | Every access decision is computed server-side from the DB. The client only displays the returned entitlement. |
| One source of truth | `src/lib/services/entitlement.ts`; `hasActiveAccess()` delegates to it. |
| Secure random codes | `crypto.randomBytes` over a 30-character unambiguous alphabet, 12 chars. |
| Hash storage | SHA-256; plaintext returned only from `generateLicenseCodes` at creation. |
| One-time codes | `maxRedemptions = 1`; conditional update guard. |
| Race conditions | Conditional `updateMany` for redemption; PostgreSQL advisory locks for the affiliate cap and owner cap. |
| Code revocation | `active=false` + `revokedAt`/`revokedBy`; only unused codes. |
| Rate limiting | Existing in-memory limiter on `/api/subscription/redeem` (per IP). |
| Admin authorization | `ADMIN_SECRET` header, constant-time compare; route is allowlisted in middleware but enforces the secret itself. |
| Owner safety | Max 2; last owner cannot be removed; confirmation required; owners cannot be access-revoked directly. |
| Audit trail | `AuditLog` records owner grant/revoke, affiliate/core revoke, premium revoke, access revoke/restore; `RedeemCodeRedemption` records every redemption. The admin actor is recorded as `admin` (the shared `ADMIN_SECRET` carries no identity). |
| RLS | **Enforced** on the user-owned licensing tables for user-scoped queries via the restricted `khata_app` role + per-user policies on `app.user_id`, inside a transaction (`withUserRls`). The owner/admin path bypasses RLS by design. Fail-closed on a missing context. Set `LICENSING_RLS_ROLE=khata_app` to switch it on. |
| No service-role key in the frontend | No new keys; the browser only calls same-origin APIs. |

---

## 11. Entitlement interface for the AI developer

Import from the service **on the server** (route handlers, server actions,
middleware-adjacent code). Do not import it into client components.

```ts
import {
  getEntitlement,
  hasCoreAccess,
  hasPremiumAccess,
  type Entitlement,
  type AccessCategory,
} from "@/lib/services/entitlement";
```

### `hasPremiumAccess(userId): Promise<boolean>`

The single check for any premium/AI feature. Returns `true` for premium,
affiliate and owner accounts while the entitlement is valid. It reads the
database, so it is always current.

```ts
export async function POST(req: NextRequest) {
  const userId = await requireUserId(req);
  if (!(await hasPremiumAccess(userId))) {
    throw new ForbiddenError("api.licensing.premiumRequired");
  }
  // …premium AI work…
}
```

### `hasCoreAccess(userId): Promise<boolean>`

Use this to gate non-AI business operations if licensing enforcement becomes
mandatory. Today `hasActiveAccess()` only enforces it when
`LICENSING_ENFORCED=true`.

### `getEntitlement(userId): Promise<Entitlement>`

```ts
type Entitlement = {
  userId: string;
  category: "UNACTIVATED" | "TRIAL" | "REGULAR" | "PREMIUM" | "AFFILIATE" | "OWNER";
  core: {
    active: boolean;
    trial: boolean;
    activatedAt: Date | null;
    expiresAt: Date | null;      // null for permanent paid core
    revokedAt: Date | null;
  };
  premium: {
    active: boolean;
    permanent: boolean;
    startedAt: Date | null;
    expiresAt: Date | null;      // null for owners/affiliates
    remainingDays: number | null;
    revokedAt: Date | null;
  };
  isOwner: boolean;
  isAffiliate: boolean;
  accessRevoked: boolean;
  accessRevokedReason: string | null;
};
```

Guidance:

- Call these functions **server-side only**. They are the only trustworthy
  source of premium access.
- Do **not** read a category or expiry from the client, a cookie, a JWT claim or
  a request body.
- Do **not** cache the result for long periods. The service is cheap (one indexed
  row) and expiry must be respected promptly. If you add caching, keep it under
  60 seconds and invalidate on redemption.
- The AI workstream owns *which* features are premium. This workstream only
  provides the entitlement facts. No AI file was modified.
- If a premium AI route already checks something, replace that check with
  `hasPremiumAccess(userId)` rather than adding a second, divergent rule.

---

## 12. Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `LICENSING_ENFORCED` | `false` | When `true`, `hasActiveAccess()` requires active core access (a trial counts as core). When `false`, the pre-licensing gate is preserved: billing off = open; billing on = legacy trial/access expiry. The entitlement service still computes and reports the real category in either case. |
| `LICENSING_RLS_ROLE` | *(unset)* | The restricted Postgres role used to enforce row-level security on user-scoped licensing queries (e.g. `khata_app`, created by the `20261109170000_enforce_licensing_rls` migration). When set, user-scoped queries run `SET LOCAL ROLE <role>` inside a transaction. When unset, they run as the connection owner and RLS is not filtered. |
| `ADMIN_SECRET` | — | Existing admin secret; must be ≥16 chars. Protects `/admin/licensing` and the admin APIs. |

Exact `hasActiveAccess()` precedence:

```
if LICENSING_ENFORCED      -> hasCoreAccess() (entitlement service)
else if !BILLING_ENABLED   -> true (fully open, pre-licensing behaviour)
else                       -> legacy subscription status gate
```

`BILLING_ENABLED` also controls the legacy `/more/subscription` presentation.
When `LICENSING_ENFORCED=true`, the API exposes `licensingEnforced` so the page
does not show the contradictory "everything is included" billing-off message.

---

## 13. Running locally

```powershell
# 1. Worktree (already created)
cd C:\Users\sadat\dev\digital-khata-app-licensing

# 2. Ensure the isolated database exists (one-time)
docker start khata-pg
docker exec khata-pg psql -U postgres -c "CREATE DATABASE khata_licensing;"

# 3. Apply migrations (also creates the restricted `khata_app` RLS role)
npx prisma migrate deploy

# 4. Install (already done)
npm install

# 5. Seed a local auto-login account (dev only)
node scripts/seed-local-demo.mjs

# 6. Run on the isolated port
npx next dev -p 3001

# 7. Optional: HTTP authorization tests against the running dev server
node scripts/test-licensing-http.mjs
```

The worktree `.env` is separate from the main repo and is gitignored. It points
`DATABASE_URL`/`DIRECT_URL` at `khata_licensing` and sets `APP_URL` to port 3001.

---

## 14. Tests and verification performed

All commands were run in the worktree, against `khata_licensing`.

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:licensing` | **101 passed, 0 failed** (run with `LICENSING_RLS_ROLE=khata_app`, i.e. RLS enforced) |
| `npm run test:licensing-rls` | **6 passed, 0 failed** (isolation proof: own rows only, cross-user write denied, empty context fails closed, owner bypass) |
| `node scripts/test-licensing-http.mjs` (against dev server) | **8 passed, 0 failed** |
| `npm run test:foundation` | 17 passed, 0 failed |
| `npm run test:voice` | 53 passed, 0 failed |
| `npm run test:khata` | 223 passed, 0 failed |
| `npm run test:assistant` | 112 passed, 0 failed |
| `npm run test:audit` | 18 passed, 0 failed |
| `npm run build` | pass (production build) |
| Production server smoke test (`next start` on 3001) | health 200, admin API 401 without secret, `/api/licensing` 401 without login, `/admin/licensing` 200, `/more/redeem` 200, `/more/subscription` 200 |

The 101 licensing checks cover:

1. Regular product activation.
2. Invalid code rejection.
3. One-time product code.
4. Regular cannot access premium; premium requires core.
5. 30-day premium activation.
6. One-time premium code.
7–8. Early renewal preserves remaining time.
9–11. Expired premium loses premium, keeps core, renews from now.
12. Affiliate permanent full access.
13. 11th affiliate code rejected (single and batch).
14. Affiliate never expires.
15–16. Owner permanent full access; owner survives premium/product redemption
    attempts. Owner cap, confirmation, last-owner protection, no direct owner
    access revocation.
17–19. Random codes cannot self-grant; admin secret is required.
20. Revoked, expired and already-redeemed codes rejected.
21. Concurrent redemption succeeds exactly once.
    Access revocation/restoration.
    Hashed storage, no plaintext in listings, one-time maxRedemptions.
    Redemption history, per-customer activation/renewal history and admin
    overview (code redemptions expose the redeemer).
22. The 30-day trial is preserved as core-only access: no premium, cannot buy
    premium, premium time on a trial is ignored, and a product code upgrades it
    to permanent core.
23. An expired trial loses core access, keeps the trial flag for the UI, and can
    activate a product.
24. `revokeAffiliate` demotes to regular while keeping permanent core;
    `revokeCore` removes core and premium; owners/affiliates must be demoted
    first; confirmation is required.
25. The legacy `/admin/codes` generator is fixed at a 30-day premium period.

The 8 HTTP checks cover: admin API rejects missing/wrong secret; accepts the
configured secret; `/api/licensing` returns only the caller's entitlement;
redeem validates invalid/empty input. The script now refuses to run against a
non-local host unless `ALLOW_REMOTE_LICENSING_TEST=1` is explicitly set.

---

## 15. Deployment (deliberate, not done)

Nothing was committed, pushed, merged or deployed.

When deployment is approved:

1. Review and commit the worktree changes on `feat/commercial-licensing`.
2. Apply `prisma/production/20261109_commercial_licensing.sql` to the production
   database with `DIRECT_URL` (manual, deliberate). It adds `coreExpiresAt` and
   grandfathers legacy paid users while preserving active trials as core-only
   trials.
3. Verify the backfill:
   - paying users (`accessExpiresAt IS NOT NULL`) have `coreExpiresAt IS NULL`;
   - active trials have `coreExpiresAt = trialExpiresAt`;
   - expired trial-only users remain unactivated.
4. Record the four migrations:
   `npx prisma migrate resolve --applied 20261109151410_add_commercial_licensing`,
   `npx prisma migrate resolve --applied 20261109153000_add_licensing_rls`,
   `npx prisma migrate resolve --applied 20261109160000_add_core_trial_expiry`, and
   `npx prisma migrate resolve --applied 20261109170000_enforce_licensing_rls`.
5. Deploy the code with `LICENSING_ENFORCED=false`. Optionally set
   `LICENSING_RLS_ROLE=khata_app` to switch on row-level security enforcement — the
   production SQL creates the `khata_app` role and grants the connecting role
   membership in it, so this is safe once the SQL above has been applied. Leaving
   it unset keeps the previous (owner-connection) behaviour.
6. Distribute codes and spot-check categories in `/admin/licensing` (including
   the activation/renewal history and "who redeemed" views).
7. Only then consider setting `LICENSING_ENFORCED=true`. Start with it `false`
   so existing customers are not locked out while codes are distributed. A trial
   counts as core, so new registrations keep working for 30 days.

---

## 16. Limitations and deliberate non-goals

- **Enforcement is off by default.** The system records and reports real
  categories, but business APIs remain open until `LICENSING_ENFORCED=true`.
  This protects existing users and avoids a surprise lockout.
- **AI gating is not implemented.** The contract exists; the AI workstream must
  wire `hasPremiumAccess()` into premium AI routes. No AI file was touched.
- **RLS is enforced once `LICENSING_RLS_ROLE=khata_app` is set.** User-scoped
  queries run as the restricted `khata_app` role with per-user policies, and fail
  closed on a missing context. The owner/admin path deliberately bypasses RLS (no
  `FORCE ROW LEVEL SECURITY`). With the variable unset the app runs as the owner
  and RLS is not filtered, which keeps a deploy safe if the role is not yet
  provisioned. Other business tables (customers, sales, stock, …) are not
  RLS-scoped — this hardening covers the licensing tables only.
- **Affiliate cap counts every affiliate code ever generated**, including
  redeemed and revoked ones, as specified ("maximum number of affiliate codes").
- **No payment provider.** Codes are issued manually after an off-platform
  payment. There is no checkout, invoice or automatic renewal.
- **Rate limiting is in-memory** (existing limiter): per IP, resets on restart,
  single-process. Multi-instance deployments should use a shared store.
- **Legacy `/admin/codes`** still exists for password reset and legacy code
  listing. It is not the canonical licensing UI; the new `/admin/licensing` is.
  Its generator now always creates 30-day premium codes; arbitrary durations are
  no longer accepted. Codes issued **before** this fix keep their stored
  `durationDays`; review/revoke any unused outliers in `/admin/codes` if you
  need a strict 30-day policy.
- **Trial is core-only and time-limited.** It does not grant AI/premium and is
  not a paid Regular product. This is a product decision; the backfill preserves
  existing active trials and grandfathers paying users.
- **Owner/affiliate revocation semantics.** `revokeAffiliate` demotes to regular
  and keeps the permanent core; use `revokeCore` afterwards to remove
  core/premium, or `revokeAccess` for a global switch. Owners must be demoted
  before core/access revocation.
- **Audit actor is not identified.** The shared `ADMIN_SECRET` has no identity;
  admin audit entries record `actor: "admin"` in metadata. True per-admin
  attribution needs separate admin accounts and is out of scope.
- **Owner management uses a shared admin secret**, not per-owner accounts or
  2FA. The secret must be rotated like any other production credential.
- **Codes are not emailed or SMSed.** The admin copies them from the one-time
  display.
- The isolated worktree `.env` is gitignored. `NODE_ENV` was removed from it so
  a local production build cannot inherit development mode; `.env.example`
  documents this.