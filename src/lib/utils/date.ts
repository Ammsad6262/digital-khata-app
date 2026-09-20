/**
 * Date helpers with cached Intl.DateTimeFormat formatters.
 *
 * All dates are stored as UTC in the database. Display helpers convert to
 * the business timezone (default "Asia/Karachi").
 *
 * PERFORMANCE: Intl.DateTimeFormat objects are cached at module level.
 * Creating a new Intl.DateTimeFormat on every call is expensive (V8 has to
 * parse the locale + options each time). Caching them reduces per-request
 * work significantly — the formatter is created once, reused forever.
 *
 * The "today" start time is also cached with a 60-second TTL since it only
 * changes once per day.
 */

// ────────────────────────────────────────────────────────────────────────────
// Cached Intl.DateTimeFormat formatters (created once, reused forever)
// ────────────────────────────────────────────────────────────────────────────

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getCachedFormatter(
  locale: string,
  options: Record<string, unknown>,
): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options as Intl.DateTimeFormatOptions);
    formatterCache.set(key, fmt);
  }
  return fmt;
}

// ────────────────────────────────────────────────────────────────────────────
// Cached timezone offset (recomputed at most once per 60 seconds)
// ────────────────────────────────────────────────────────────────────────────

const offsetCache = new Map<string, { value: number; expiresAt: number }>();
const OFFSET_TTL_MS = 60_000; // 60 seconds

function getTzOffsetMinutes(timezone: string, now: Date = new Date()): number {
  const cached = offsetCache.get(timezone);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const parts = getCachedFormatter("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string): string => {
    const p = parts.find((p) => p.type === type);
    return p ? p.value : "0";
  };

  const asIfUtc = Date.UTC(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    parseInt(get("hour"), 10) === 24 ? 0 : parseInt(get("hour"), 10),
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10),
  );

  const offset = Math.round((asIfUtc - now.getTime()) / 60000);
  offsetCache.set(timezone, { value: offset, expiresAt: Date.now() + OFFSET_TTL_MS });
  return offset;
}

// ────────────────────────────────────────────────────────────────────────────
// Cached "start of today" (recomputed at most once per 60 seconds)
// ────────────────────────────────────────────────────────────────────────────

const startOfTodayCache = new Map<string, { value: Date; expiresAt: number }>();

/**
 * Returns the start of "today" in the given timezone, as a UTC Date.
 *
 * Cached for 60 seconds — the start of "today" only changes once per day,
 * so caching it avoids redundant Intl.DateTimeFormat + Date.UTC calls
 * on every API request.
 */
export function startOfTodayInTz(timezone: string = "Asia/Karachi"): Date {
  const cached = startOfTodayCache.get(timezone);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const now = new Date();
  const tzDateStr = getCachedFormatter("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const offsetMin = getTzOffsetMinutes(timezone, now);
  const midnightUtc = new Date(`${tzDateStr}T00:00:00.000Z`);
  const result = new Date(midnightUtc.getTime() - offsetMin * 60000);

  startOfTodayCache.set(timezone, { value: result, expiresAt: Date.now() + OFFSET_TTL_MS });
  return result;
}

/** Returns the start of `n` days ago in the given timezone. */
export function startNDaysAgoInTz(n: number, timezone: string = "Asia/Karachi"): Date {
  const start = new Date(startOfTodayInTz(timezone));
  start.setUTCDate(start.getUTCDate() - n);
  return start;
}

/** Returns the start of the current week (Monday) in the given TZ. */
export function startOfWeekInTz(timezone: string = "Asia/Karachi"): Date {
  const start = new Date(startOfTodayInTz(timezone));
  const day = start.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diff);
  return start;
}

/** Returns the start of the current month in the given TZ. */
export function startOfMonthInTz(timezone: string = "Asia/Karachi"): Date {
  const now = new Date();
  const tzMonthStr = getCachedFormatter("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).format(now);

  const offsetMin = getTzOffsetMinutes(timezone, now);
  const midnightUtc = new Date(`${tzMonthStr}-01T00:00:00.000Z`);
  return new Date(midnightUtc.getTime() - offsetMin * 60000);
}

// ────────────────────────────────────────────────────────────────────────────
// Display formatters (use cached formatters)
// ────────────────────────────────────────────────────────────────────────────

/** Format a Date for display in the business TZ: "16 Sep 2026, 2:30 PM". */
export function formatDateTime(date: Date, timezone: string = "Asia/Karachi"): string {
  return getCachedFormatter("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Format a Date for display: "16 Sep 2026" (no time). */
export function formatDate(date: Date, timezone: string = "Asia/Karachi"): string {
  return getCachedFormatter("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Format a Date for display: "2:30 PM" (no date). */
export function formatTime(date: Date, timezone: string = "Asia/Karachi"): string {
  return getCachedFormatter("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Relative time: "5 min ago", "2 hours ago", "Yesterday", or absolute date. */
export function formatRelative(date: Date, timezone: string = "Asia/Karachi"): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return formatDate(date, timezone);
}
