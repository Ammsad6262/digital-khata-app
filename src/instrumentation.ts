import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook (server).
 *
 * This file MUST live at the root of the `src` directory: when a project uses
 * `src/app`, Next looks for instrumentation inside `src/`, not the repository
 * root. (Placed at the repo root it is silently ignored — which is how a Sentry
 * install can look correct and still receive nothing.)
 *
 * Loads the config for whichever runtime is executing, and forwards request
 * errors (route handlers, server components, middleware) to Sentry. Both
 * imports are no-ops when SENTRY_DSN is unset.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;