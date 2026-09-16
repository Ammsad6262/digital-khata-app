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
/**
 * Returns the offset of the given timezone from UTC, in minutes, at the given
 * instant. Uses Intl.DateTimeFormat to get the parts in the target TZ, then
 * computes the difference between that local wall-clock time and the UTC
 * wall-clock time.
 *
 * E.g. for Asia/Karachi (UTC+5) this returns -300 (because local time is
 * 5 hours AHEAD of UTC, so UTC = local - 5h, meaning offset_minutes = -300).
 *
 * Used to construct Date objects that represent midnight IN the target TZ
 * (not midnight UTC, which would be wrong by the offset).
 */
function getTzOffsetMinutes(timezone: string, now: Date = new Date()): number {
  // Get the wall-clock time in the target TZ
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string): string => {
    const p = parts.find((p) => p.type === type);
    return p ? p.value : "0";
  };

  // Build a Date as if the TZ-local wall-clock time were UTC.
  const asIfUtc = Date.UTC(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    parseInt(get("hour"), 10) === 24 ? 0 : parseInt(get("hour"), 10),
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10),
  );

  // offset = (local-as-UTC) - (actual UTC), in minutes
  // Positive means TZ is ahead of UTC (e.g. +300 for Karachi).
  return Math.round((asIfUtc - now.getTime()) / 60000);
}

/**
 * Returns the start of "today" in the given timezone, as a UTC Date.
 *
 * IMPORTANT: This returns midnight in the business TZ, expressed as a UTC Date.
 *   For Asia/Karachi (UTC+5), midnight PKT = 7pm UTC the previous day.
 *   Previously this returned midnight UTC, which was 5 hours too late —
 *   excluding early-morning transactions from "today" filters.
 */
export function startOfTodayInTz(timezone: string = "Asia/Karachi"): Date {
  const now = new Date();
  // Get today's date in the target TZ (as YYYY-MM-DD)
  const tzDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // tzDateStr looks like "2026-09-16"

  // Get the offset for this TZ (in minutes). For Karachi this is +300.
  const offsetMin = getTzOffsetMinutes(timezone, now);

  // Construct midnight UTC on that date, then SUBTRACT the offset to get
  // midnight in the target TZ expressed as UTC.
  // Midnight UTC on 2026-09-16 = 2026-09-16T00:00:00.000Z
  // Midnight PKT on 2026-09-16 = 2026-09-15T19:00:00.000Z (subtract 5 hours)
  const midnightUtc = new Date(`${tzDateStr}T00:00:00.000Z`);
  return new Date(midnightUtc.getTime() - offsetMin * 60000);
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
  // Get YYYY-MM in the target TZ
  const tzMonthStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).format(now);
  // tzMonthStr looks like "2026-09"

  const offsetMin = getTzOffsetMinutes(timezone, now);

  // Midnight UTC on the 1st of that month, then subtract offset for TZ-correct midnight
  const midnightUtc = new Date(`${tzMonthStr}-01T00:00:00.000Z`);
  return new Date(midnightUtc.getTime() - offsetMin * 60000);
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
