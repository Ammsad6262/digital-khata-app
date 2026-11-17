# Email verification — rollout and QA checklist

Companion to `docs/EMAIL_VERIFICATION.md` (implementation notes). This is the
operator's checklist: what to do, in what order, and how to prove it works.

The system ships **disabled**. `EMAIL_VERIFICATION_ENFORCED=false` means the
whole flow exists and can be tested, but nobody is blocked. Turn it on only after
a real email has arrived in a real inbox.

## 1. Resend account and domain

1. Create the account at https://resend.com (free: 3,000 emails/month).
2. **Domains → Add domain → `dukhata.com`.**
3. Resend shows DNS records. Add them at **Namecheap → Domain List → dukhata.com
   → Advanced DNS**. Expect three:
   - `MX` on host `send` → Resend's feedback host (priority 10)
   - `TXT` on host `send` → the SPF value Resend gives (`v=spf1 include:... ~all`)
   - `TXT` on host `resend._domainkey` → the long DKIM public key
4. **Do not touch the existing `MX` records on `@`** — those are Dukhata's email
   forwarding. The new MX is on the `send` subdomain only.
5. Wait for Resend to show **Verified** (usually minutes).
6. **API Keys → Create API key**, permission "Sending access", and send it to the
   agent to store as `RESEND_API_KEY` in Vercel (production + preview).

## 2. Environment variables (Vercel → Settings → Environment Variables)

| Key | Value | When |
| --- | --- | --- |
| `EMAIL_FROM` | `Dukhata <no-reply@dukhata.com>` | already set |
| `EMAIL_VERIFICATION_ENFORCED` | `false` → later `true` | already set to false |
| `RESEND_API_KEY` | `re_...` | after Resend verifies the domain |

Redeploy after adding `RESEND_API_KEY` — environment changes only reach running
functions on a new deployment.

## 3. Prove delivery before enforcing

### Already proven (17 Nov 2026)

| Check | Result |
| --- | --- |
| Resend domain `dukhata.com` | **Verified**, region Tokyo (`ap-northeast-1`) |
| Test send from `Dukhata <no-reply@dukhata.com>` | **200** (Resend id `01a1e763-4f63-75d9-a9cb-cac2677df02c`) |
| Landed in the **inbox** at `dukhata.app@gmail.com` | **Yes** — arrived within a minute, correct subject and body, 6-digit code visible |
| `RESEND_API_KEY` in Vercel (production + preview) | Set (send-only key, by design) |

The key is intentionally **send-only**: it cannot read domains or email status
(`401` on those endpoints). That is the correct least-privilege scope for a
server that only sends codes. Domain and delivery management happen in the
Resend dashboard.

### Still to run once the feature is deployed

1. Register a fresh account with an inbox you control.
2. Check the email arrives **and** that Gmail shows it as authenticated
   (three-dot menu → "Show original" → SPF pass, DKIM pass).
3. Enter a wrong code on purpose: the error must be specific and the first box
   must regain focus.
4. Enter the right code: you land on `/dashboard` and the account shows verified.
5. Press **Resend** twice quickly: the second must be refused by the 60-second
   cooldown, with the remaining seconds shown.
6. Leave a code unused for 10 minutes: it must be rejected as expired.
7. Five wrong attempts: the code must be revoked and require a resend.
8. Check the database directly:
   ```sql
   select "emailVerifiedAt" from "User" where email = '<the test address>';
   select count(*) from "EmailVerificationCode" c join "User" u on u.id = c."userId"
    where u.email = '<the test address>';
   ```
   The stored `codeHash` must be a hash, never the digits.

## 4. Turn enforcement on

1. Set `EMAIL_VERIFICATION_ENFORCED=true` in Vercel and redeploy.
2. Verify the chosen policy (default is **B**):
   - unverified: app usable, **AI / exports / redeem blocked**
   - verified: everything
3. Log in as an existing account: it must already be verified (the migration
   grandfathered every account that existed on 17 Nov 2026).
4. Confirm Log out is always reachable from the verify wall.

## 5. Rollback

Set `EMAIL_VERIFICATION_ENFORCED=false` and redeploy. Nobody is blocked, codes
stop being required, and no data is lost. This is the reason the flag exists.

## 6. Failure modes to watch

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No email arrives, Resend shows "delivered" | landed in spam | check SPF/DKIM, warm the domain, add DMARC `p=none` |
| Resend 403 | API key restricted to another domain or revoked | issue a new key |
| Resend 422 | `from` not on a verified domain | finish domain verification |
| Users report codes rejected | clock skew or they used an old email | 10-minute TTL + "resend" is the recovery path |
| Codes work but enforcement ignores them | flag not redeployed | redeploy after changing the env var |

## 7. Cost and limits

3,000 emails/month free. One code per signup plus occasional resends, so even a
few hundred signups a month stays free. Above that, Resend is $20/month for
50,000.