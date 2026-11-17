/**
 * PII scrubbing for Sentry events.
 *
 * This app stores shopkeepers' customers: names, phone numbers, balances. None
 * of that belongs in an error tracker. We drop request bodies/cookies and
 * redact anything that looks like an email address or a long digit run (phone
 * numbers, account numbers) from the message and from exception values.
 *
 * Deliberately conservative: if a pattern is ambiguous, redact it. Losing a
 * little debugging detail is cheaper than leaking a customer's phone number.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 7+ consecutive digits, optionally separated by spaces/dashes: phone numbers,
// CNIC, account numbers. Keeps short numbers (status codes, IDs) readable.
const LONG_DIGITS = /\b(?:\d[ -]?){7,}\d\b/g;

export function redactText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(EMAIL, "[email]").replace(LONG_DIGITS, "[number]");
}

type SentryEventLike = {
  message?: string;
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, unknown>;
    query_string?: unknown;
  };
  user?: unknown;
  extra?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown> }>;
};

/**
 * Mutates and returns the event. Applied in `beforeSend` for every runtime.
 * Keep the path (useful for grouping) but drop the query string, which can
 * carry search terms or IDs.
 */
export function redactSentryEvent<T extends SentryEventLike>(event: T): T {
  if (event.message) event.message = String(redactText(event.message));

  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (typeof value.value === "string") value.value = String(redactText(value.value));
    }
  }

  if (event.request) {
    if (event.request.url) {
      event.request.url = event.request.url.split("?")[0];
    }
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
    }
  }

  delete event.user;

  if (event.extra) {
    for (const key of ["email", "phone", "password", "pin", "token", "customer"]) {
      delete event.extra[key];
    }
  }

  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (typeof crumb.message === "string") crumb.message = String(redactText(crumb.message));
      if (crumb.data) {
        for (const key of ["email", "phone", "password", "pin", "token"]) {
          delete crumb.data[key];
        }
      }
    }
  }

  return event;
}

/** Common init options, so all three runtimes agree. */
export const SENTRY_BASE_OPTIONS = {
  // Errors only. Tracing costs money and battery on the cheap phones this app
  // targets; it can be raised later once the error signal is clean.
  tracesSampleRate: 0,
  // Never attach IP addresses, cookies or request bodies automatically.
  sendDefaultPii: false,
  // Ignore the noisy, non-actionable browser/network errors that would swamp
  // the quota on a shop phone with poor connectivity.
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    "NetworkError when attempting to fetch resource",
    "Failed to fetch",
    "Load failed",
    "AbortError",
    "ChunkLoadError",
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ] as string[],
};