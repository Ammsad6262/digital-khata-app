# Email verification

Six-digit email verification for Dukhata, shipped **behind a flag that is OFF
by default**. The whole flow exists and can be exercised, but nobody is blocked
until a real email has arrived in a real inbox and `EMAIL_VERIFICATION_ENFORCED`
is set to `true`.

---

## 1. What the flow does

1. **Registration** (`POST /api/auth/register`) creates the account, sets the
   auth cookie, then **best-effort** issues a code and emails it. A provider
   outage never fails registration; the response includes
   `verificationSent` so the client knows whether a code actually left.
2. **Issuing a code** (`issueVerificationCode`) revokes every earlier
   unconsumed code, enforces a 60-second cooldown and a rolling 24-hour cap of
   5 sends, then stores only `sha256(code + ":" + SESSION_SECRET)`.
3. **Delivery** (`src/lib/email/send-email.ts`) uses Resend when
   `RESEND_API_KEY` is present, otherwise a console provider.
4. **Verification** (`POST /api/auth/verify/confirm`) finds the newest live
   code, **counts the attempt before comparing**, compares timing-safely, and
   on success sets `EmailVerificationCode.consumedAt` and
   `User.emailVerifiedAt` in one transaction.
5. **The UI** at `/verify-email`: six boxes, paste/autofill, auto-submit,
   60-second resend countdown, specific error states, EN/UR + RTL.

### Constants

| Constant | Value |
| --- | --- |
| `CODE_LENGTH` | 6 digits (leading zeros allowed) |
| `CODE_TTL_MINUTES` | 10 |
| `MAX_ATTEMPTS` | 5 (the 5th wrong attempt retires the code) |
| `RESEND_COOLDOWN_SECONDS` | 60 |
| `MAX_SENDS_PER_DAY` | 5 (rolling 24 hours) |

### What is stored

`EmailVerificationCode` keeps the hash, expiry, attempt count, and a single
`consumedAt` marker (used for success **and** revocation — a resend marks older
rows consumed). The plaintext code is never written to the database, the audit
log, or application logs.

### API

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/verify/send` | Signed-in, no subscription required. Returns `{ ok, expiresAt, cooldownSeconds, sent, provider }`. **Never returns the code.** Rate-limited per account and per IP. |
| `POST` | `/api/auth/verify/confirm` | Body `{ code }`, exactly six digits (spaces/dashes/local numerals normalised first). `200` on success, `400` wrong code, `410` expired / attempts exhausted — all with a `messageKey`. |
| `GET` | `/api/auth/me` | Adds `emailVerifiedAt` to the user and `emailVerificationEnforced` to the payload. |

---

## 2. Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `RESEND_API_KEY` | for real delivery | Presence of this key **is** the provider choice. There is no `EMAIL_PROVIDER` variable; the provider is implicit. |
| `EMAIL_FROM` | no | `from` address. Defaults to `Dukhata <no-reply@dukhata.com>`. Must be on the verified domain. |
| `EMAIL_VERIFICATION_ENFORCED` | no | Exactly the string `true` turns the wall on. Anything else — including unset, `false`, `1`, `TRUE` — is OFF. |
| `SESSION_SECRET` | yes in production | 32+ chars. Also peppers the code hash; changing it invalidates outstanding codes. |

`EMAIL_PROVIDER` is deliberately **not** read. Adding it would imply a second
switch to keep in sync with the key.

> Environment changes on Vercel only reach running functions after a redeploy.

---

## 3. Resend + Namecheap DNS

1. Create a Resend account and add the domain `dukhata.com`
   (Resend → Domains → Add domain).
2. Resend shows the records to add. In **Namecheap → Domain List →
   dukhata.com → Advanced DNS**, add exactly what Resend shows. Typically:
   - **MX** on host `send` → Resend's feedback host, priority 10.
   - **TXT** on host `send` → the SPF value (`v=spf1 include:… ~all`).
   - **TXT** on host `resend._domainkey` → the long DKIM public key.
3. **Keep the existing `MX` records on `@`.** They handle Dukhata's own mail
   forwarding; the new MX is only on the `send` subdomain.
4. Wait until Resend shows the domain as **Verified**.
5. Create an API key with *Sending access* and store it as `RESEND_API_KEY`
   (Production and Preview), then redeploy.
6. Register a test account with an inbox you control and check Gmail's
   "Show original" reports **SPF pass** and **DKIM pass**.

Optional but recommended: a DMARC TXT record on `_dmarc` with `p=none` while
the domain warms up.

---

## 4. Turning enforcement on

1. Confirm delivery works (step 3 above).
2. Set `EMAIL_VERIFICATION_ENFORCED=true` in Vercel and **redeploy**.
3. An unverified account now sees `VerifyEmailWall` on every path except:
   - `/verify-email`
   - `/more/settings`
   - `/more/subscription`
   - `/more/redeem`

   Log out is always available on the wall.
4. Existing accounts are already verified: the production DDL grandfathers every
   account that existed when `emailVerifiedAt` was added.

### Why the wall, and not a soft block

This build implements the strict wall requested for this release: unverified
users reach only the four paths above. (`docs/EMAIL_VERIFICATION_QA.md` §4
describes an older "policy B" — app usable but AI/exports/redeem blocked — which
is **not** what this code does. Under the wall those features are unreachable
anyway.)

### Voluntary verification with the flag off

Unverified users see a slim, in-flow strip above the app shell linking to
`/verify-email`. It is not fixed and never overlays the header, bottom dock,
form action bars, or a receipt, and dismissing it lasts for the browser session
(`sessionStorage`). It is hidden while enforcement is on, because the wall
already handles it.

---

## 5. Rollback

Set `EMAIL_VERIFICATION_ENFORCED=false` (or delete it) and redeploy.

- Nobody is blocked; the wall is never mounted.
- Codes stop being required. `/verify-email` still works for volunteers.
- No data is lost. The column and table stay; verification timestamps stay.

This is exactly why the flag defaults to OFF: there is no way for a deployment
without a working email provider to lock an owner out.

---

## 6. Database

- Schema: `prisma/schema.prisma` (`User.emailVerifiedAt`,
  `EmailVerificationCode`).
- Production DDL: `prisma/production/20261117_email_verification.sql`, applied
  by `scripts/apply-production-ddl.mjs` on Vercel only.
- The DDL is idempotent. Its grandfather `UPDATE` is guarded so it runs **only
  when the column is first added** — otherwise every later deploy would mark
  new, unverified sign-ups as verified and silently defeat enforcement.

Manual check after a test signup:

```sql
select "emailVerifiedAt" from "User" where email = '<test address>';
select "codeHash", "attempts", "consumedAt"
  from "EmailVerificationCode" c
  join "User" u on u.id = c."userId"
 where u.email = '<test address>'
 order by c."createdAt" desc;
```

`codeHash` must be a 64-character hex digest, never the six digits.

---

## 7. Tests and diagnostics

- `npm run test:email-verification` — pure tests (format, leading zeros,
  peppered hash, TTL, attempt-cap table, normalisation, flag default, template).
- `GET /api/admin/diagnostics` now includes
  `emailVerification: { enforced, providerConfigured }` — booleans only.

---

## 8. Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No email, Resend says delivered | spam folder / new domain | check SPF/DKIM, add DMARC `p=none`, warm up |
| Resend 403 | key revoked or restricted to another domain | issue a new key |
| Resend 422 | `EMAIL_FROM` not on the verified domain | fix the from address or finish verification |
| Registration succeeds but no email | no `RESEND_API_KEY`, or provider error | check logs for `[email] resend status …`; the user can resend |
| Codes always rejected | device clock skew or an old email | 10-minute TTL; resend |
| Enforcement seems ignored | flag changed without redeploy | redeploy |
| `[email] skipped (no provider configured)` in production | provider not configured | add `RESEND_API_KEY` (codes are never logged) |