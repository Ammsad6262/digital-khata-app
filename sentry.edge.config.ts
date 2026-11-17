import * as Sentry from "@sentry/nextjs";
import { SENTRY_BASE_OPTIONS, redactSentryEvent } from "./src/lib/monitoring/redact";

/**
 * Sentry — Edge runtime (middleware/proxy). Kept minimal: the edge runtime has
 * a small bundle budget, and almost all app errors happen in Node.
 */
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  ...SENTRY_BASE_OPTIONS,
  beforeSend(event) {
    return redactSentryEvent(event) as typeof event;
  },
});