import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook (server). Loads the config for whichever
 * runtime is executing, and forwards request errors (route handlers, server
 * components, middleware) to Sentry.
 *
 * The dynamic imports keep the Edge config out of the Node bundle and vice
 * versa. Both are no-ops when SENTRY_DSN is unset.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;