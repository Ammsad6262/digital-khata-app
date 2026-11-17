import * as Sentry from "@sentry/nextjs";
import { SENTRY_BASE_OPTIONS, redactSentryEvent } from "./src/lib/monitoring/redact";

/**
 * Sentry — Node runtime (API routes, server components, Prisma errors).
 *
 * Inert unless SENTRY_DSN is set, so shipping this cannot break a deployment
 * that has no Sentry project yet.
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