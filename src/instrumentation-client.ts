import * as Sentry from "@sentry/nextjs";
import { SENTRY_BASE_OPTIONS, redactSentryEvent } from "./lib/monitoring/redact";

/**
 * Sentry — browser runtime. Must live in `src/` because the app uses `src/app`.
 *
 * NEXT_PUBLIC_ is required because this file runs in the browser. Sending goes
 * through the tunnel route configured in next.config.mjs, so it is same-origin
 * (the app's CSP only allows connect-src 'self') and ad-blockers do not drop it.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  ...SENTRY_BASE_OPTIONS,
  beforeSend(event) {
    return redactSentryEvent(event) as typeof event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;