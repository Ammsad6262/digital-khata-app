# Vercel operations

## Project

| | |
| --- | --- |
| Project | `digital-khata-app` (`prj_YQ1cKCs8hXgEXagkC7Tuwv5Em5Y1`) |
| Team | `team_9AtRBxynYsiWmpiGE6Up19uZ` |
| Git | `Ammsad6262/digital-khata-app`, production branch `main` |
| Framework | Next.js, Node 24.x, root `.` |
| Production URL | https://digital-khata-app-two.vercel.app |
| Function region | `bom1` (Mumbai), pinned in `vercel.json` |
| Database region | `ap-south-1` (Mumbai) |

Functions run next to the database. The build machine is in `iad1`, which is
normal and does not affect request latency.

## Domains

| Domain | Behaviour |
| --- | --- |
| `dukhata.com` | Primary production domain |
| `www.dukhata.com` | 308 redirect to `dukhata.com` |
| `digital-khata-app-two.vercel.app` | Vercel default alias, kept as a working fallback |

DNS is managed at **Namecheap** (registrar) — not delegated to Vercel, so the
existing MX records for `@dukhata.com` email forwarding keep working.

### Records to keep in Namecheap Advanced DNS

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `216.198.79.1` | Automatic |
| A | `@` | `64.29.17.1` | Automatic |
| CNAME | `www` | `0b4d1fd4ad8c651e.vercel-dns-017.com` | Automatic |

Delete Namecheap's parking records (`A @ 162.255.119.12`, and the `www` CNAME to
`parkingpage.namecheap.com`). Do **not** touch the `MX` and `SPF` records.

Vercel issues the TLS certificate automatically once the records resolve. Check
Project -> Settings -> Domains: it should read *Valid Configuration*.

`APP_URL` is set to `https://dukhata.com` for production and preview.

## Environment variables

| Key | Targets | Notes |
| --- | --- | --- |
| `DATABASE_URL` | production, preview | Prisma runtime connection |
| `DIRECT_URL` | production | Session-mode pooler, used by DDL/migrations |
| `SESSION_SECRET` | production, preview | 32+ chars; auth and reset-code pepper |
| `ADMIN_SECRET` | production | Admin code issuance; **production only on purpose** |
| `GEMINI_API_KEY` | production, preview | Customer key (PREMIUM/TRIAL) |
| `GEMINI_OWNER_API_KEY` | production, preview, development | Owner/affiliate key |
| `APP_URL` | production, preview | Absolute URL for links |
| `NODE_ENV` | production, preview | |
| `SKIP_PRODUCTION_DDL` | preview | Previews never run schema DDL |

Values are marked **sensitive**, so the API cannot read them back — that is
intentional. Change them in the dashboard, or with a new deployment.

`DATABASE_URL` is shared with Preview, so a preview deployment talks to the
production database. Preview URLs are protected by Vercel SSO
(`all_except_custom_domains`) and fork protection is on, so only team members can
open them. If previews should be fully isolated later, give them a separate
database and remove `preview` from this variable's targets.

## Deploying

Push to `main`. Vercel then:

1. installs dependencies,
2. runs `scripts/apply-production-ddl.mjs` (skipped outside Vercel; on Preview
   it exits early because `SKIP_PRODUCTION_DDL=1`),
3. runs `next build`,
4. promotes the deployment to the production alias if the build succeeds.

A failed build leaves the previous deployment live. Builds take about 30–40 s.

## Rolling back

Dashboard → Deployments → previous `READY` deployment → **Promote to Production**.
Or revert the commit and push; a rollback of the alias is faster.

Last known-good deployments:

| Commit | Time (UTC) | Note |
| --- | --- | --- |
| `6192e27` | 2026-11-16 12:10 | AI key split (owner/customer pools) |
| `03150ba` | 2026-11-16 09:59 | Functions pinned to Mumbai |
| `ef9ec6b` | 2026-11-16 09:34 | DB cleanup + integrity repair |

## Auditing

```bash
npm run vercel:audit
```

Read-only. Prints project settings, env var names and targets, domains, the last
12 deployments and a scan of the latest build log. It needs `VERCEL_TOKEN` in
`.env.local`; the token is never printed.

## Watching for regressions

The production probe is public and checks the database:

```bash
curl -s https://digital-khata-app-two.vercel.app/api/health
# {"ok":true,"data":{"status":"connected"}}
```

A 503 means the circuit breaker tripped (database unreachable). The response
never includes row counts or business data.

## Token hygiene

- Use a scoped Vercel token with an expiry; delete it when the work is done.
- Never put a token in the repo. `.env.local` is gitignored.
- Rotate the token that was shared in chat after the session.