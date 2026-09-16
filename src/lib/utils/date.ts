/**
 * Date helpers.
 *
 * All dates are stored as UTC in the database. Display helpers convert to
 * the business timezone (default "Asia/Karachi" — see Setting.timezone).
 *
 * Note: "Today" calculations are tricky with timezones. A sale recorded at
 * 11pm PKT on Sep 16 is stored as Sep 16 18:00 UTC. We want the dashboard
 * to show it as "today" if the user is viewing in PKT. So we compute the
 * start of "today" in the user's timezone, then compare.
 */

/**
 * Returns the start of "today" in the given timezone, as a UTC Date.
 * Default TZ is Asia/Karachi (the business's primary market in V1).
 */
export function startOfTodayInTz(timezone: string = "Asia/Karachi"): Date {
  // Use Intl to format "today's date" in the target TZ, then construct a UTC
  // Date at midnight on that day.
  const now = new Date();
  const tzDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // tzDateStr looks like "2026-09-16"
  return new Date(`${tzDateStr}T00:00:00.000Z`);
}

/** Returns the start of `n` days ago in the given timezone (for "last 7 days" etc.). */
export function startNDaysAgoInTz(n: number, timezone: string = "Asia/Karachi"): Date {
  const start = startOfTodayInTz(timezone);
  start.setUTCDate(start.getUTCDate() - n);
  return start;
}

/** Returns the start of the current week (Monday) in the given TZ. */
export function startOfWeekInTz(timezone: string = "Asia/Karachi"): Date {
  const start = startOfTodayInTz(timezone);
  const day = start.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Make Monday the first day of the week.
  const diff = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diff);
  return start;
}

/** Returns the start of the current month in the given TZ. */
export function startOfMonthInTz(timezone: string = "Asia/Karachi"): Date {
  const now = new Date();
  const tzDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return new Date(`${tzDateStr}-01T00:00:00.000Z`);
}

/** Format a Date for display in the business TZ: "16 Sep 2026, 2:30 PM". */
export function formatDateTime(date: Date, timezone: string = "Asia/Karachi"): string {
  return new Intl.DateTimeFormat("en-GB", {
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
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Format a Date for display: "2:30 PM" (no date). */
export function formatTime(date: Date, timezone: string = "Asia/Karachi"): string {
  return new Intl.DateTimeFormat("en-GB", {
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
