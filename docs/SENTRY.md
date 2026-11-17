# Sentry — error monitoring

Installed: `@sentry/nextjs` **11.13.0** (supports Next 16 / React 19).

Sentry is **wired but inert**: with no DSN it initialises nothing and sends
nothing. Shipping it cannot break a deployment.

## What was added

| File | Purpose |
| --- | --- |
| `instrumentation-client.ts` | Browser SDK init + router transition breadcrumbs |
| `instrumentation.ts` | `register()` loads the Node or Edge config; forwards `onRequestError` |
| `sentry.server.config.ts` | Node runtime (API routes, server components, Prisma) |
| `sentry.edge.config.ts` | Edge runtime (middleware) |
| `src/lib/monitoring/redact.ts` | PII scrubbing + shared init options |
| `src/app/global-error.tsx` | Reports root-layout crashes (the only boundary outside providers) |
| `next.config.mjs` | `withSentryConfig`, tunnel route, source-map handling |

## Configuration choices

- **Tunnel route `/monitoring`**: events go to the app's own origin and are
  proxied to Sentry. This is required because the CSP allows only
  `connect-src 'self'`, and it also avoids ad-blockers.
- **Errors only** (`tracesSampleRate: 0`). No performance overhead on shop
  phones; 5k free events/month.
- **PII scrubbing** (`src/lib/monitoring/redact.ts`):
  - request bodies, cookies, query strings and `user` are removed;
  - `authorization` and `cookie` headers dropped;
  - emails and runs of 7+ digits (phone numbers, CNIC) redacted from messages,
    exception values and breadcrumbs;
  - `sendDefaultPii: false`.
- **Noise filtered**: ResizeObserver, failed fetch/network errors, AbortError,
  ChunkLoadError, `NEXT_REDIRECT`/`NEXT_NOT_FOUND` (control-flow, not bugs).
- **Environment + release**: `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA`, so an
  issue says whether it came from production or a preview and which commit.

## Environment variables

| Key | Target | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | production, preview | the project DSN (browser) |
| `SENTRY_DSN` | production, preview | the same DSN (server/edge) |
| `SENTRY_ORG` | production, preview | org slug — optional, only for source maps |
| `SENTRY_PROJECT` | production, preview | project slug — optional |
| `SENTRY_AUTH_TOKEN` | production, preview | optional; enables source-map upload |

Without `SENTRY_AUTH_TOKEN`, source maps are skipped and the build still
succeeds; stack traces are minified but grouped correctly.

## Turning it on

1. Sentry → **Projects → New project → Next.js** → copy the **DSN**.
2. Add `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` (same value) in Vercel for
   production + preview.
3. Redeploy (environment changes need a new deployment).
4. Trigger a test error and confirm it appears:
   - temporarily add a route that throws, or
   - in the browser console: `fetch('/api/health')` will not throw — instead
     open a page and run `throw new Error('sentry smoke test')` from DevTools
     (client errors are captured by `instrumentation-client.ts`).
5. Confirm the event shows the environment, the commit, and **no** cookies,
   bodies, emails or long digit runs.

## Verifying the tunnel

```bash
curl -sI https://dukhata.com/monitoring | head -3
```

The route exists after the first deploy that includes Sentry, even while the
DSN is unset.

## Notes

- `npm audit` reports one pre-existing **high** advisory in `zod` (memory
  exhaustion when validating oversized constrained collections). It is unrelated
  to Sentry and predates this change; upgrading zod needs its own pass.
- Do not enable `sendDefaultPii`. This app stores other people's names and phone
  numbers; the scrubbing exists for that reason, not as a formality.