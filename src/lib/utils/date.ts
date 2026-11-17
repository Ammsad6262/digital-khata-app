/**
 * Date helpers — simplified, robust timezone handling.
 *
 * All dates are stored as UTC in the database. These helpers compute
 * "start of [period]" in the business timezone (Asia/Karachi) as a UTC Date
 * that can be used directly in Prisma `date: { gte: ... }` queries.
 *
 * APPROACH: Instead of computing timezone offsets manually (which is error-
 * prone and can break in serverless environments), we use Intl.DateTimeFormat
 * to format the current time in the target timezone, then construct a Date
 * from that formatted string. This leverages the V8 engine's built-in
 * timezone database, which is always correct.
 */

import type { TranslationKey } from "@/lib/i18n/translations";

// ────────────────────────────────────────────────────────────────────────────
// Period start computation (used for date filtering in queries)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns the start of "today" in the given timezone, as a UTC Date.
 *
 * Example: if it's 3 AM on Sep 22 in Karachi (10 PM Sep 21 UTC),
 * this returns Sep 21 19:00 UTC (= midnight Sep 22 Karachi).
 */
export function startOfTodayInTz(timezone: string = "Asia/Karachi"): Date {
  return startOfPeriodInTz(timezone, "day");
}

/** Returns the start of the current week (Monday) in the given TZ. */
export function startOfWeekInTz(timezone: string = "Asia/Karachi"): Date {
  return startOfPeriodInTz(timezone, "week");
}

/** Returns the start of the current month in the given TZ. */
export function startOfMonthInTz(timezone: string = "Asia/Karachi"): Date {
  return startOfPeriodInTz(timezone, "month");
}

/**
 * Which day the week starts on.
 *
 * Sunday, not Monday. The owner reported that a sale made on Sunday did not
 * appear under "This week", which is exactly what a Monday-start week does in
 * Pakistan's calendar (the week people read on a wall calendar begins Sunday).
 * Change this single line to "mon" to go back to an ISO week.
 */
export const WEEK_STARTS_ON: "sun" | "mon" = "sun";

/** Wall-clock parts of an instant, in the business timezone. */
function wallParts(
  instant: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (type: string): number =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const weekdayName = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  // 0 = Sunday ... 6 = Saturday
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    weekday: weekdayMap[weekdayName] ?? 0,
  };
}

/**
 * The UTC instant at which a civil date begins in `timezone`.
 *
 * Solved by measuring, not by assuming a sign. The previous version assumed a
 * positive UTC offset (it read the time-of-day at midnight UTC and subtracted
 * it), which is right for Karachi and exactly one day wrong for any zone west of
 * Greenwich — e.g. New York reported yesterday's midnight as today's. Here we
 * format a guess in the target zone, measure the real difference, and correct,
 * refining once so daylight-saving transitions land right too.
 */
function zonedMidnight(year: number, month: number, day: number, timezone: string): Date {
  const civilAsUtc = Date.UTC(year, month - 1, day);
  let offsetMs = 0;

  for (let pass = 0; pass < 3; pass += 1) {
    const guess = civilAsUtc - offsetMs;
    const wall = wallParts(new Date(guess), timezone);
    const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    const measured = wallAsUtc - guess;
    if (measured === offsetMs) break;
    offsetMs = measured;
  }

  return new Date(civilAsUtc - offsetMs);
}

/**
 * Core: the start of a period (day/week/month/year) in a given timezone, as a
 * UTC Date that can go straight into a Prisma `gte` clause.
 */
function startOfPeriodInTz(
  timezone: string,
  period: "day" | "week" | "month" | "year",
): Date {
  const wall = wallParts(new Date(), timezone);
  let year = wall.year;
  let month = wall.month;
  let day = wall.day;

  if (period === "week") {
    // Days elapsed since the start of the week. Sunday-start: Sunday is day 0.
    const elapsed = WEEK_STARTS_ON === "sun" ? wall.weekday : (wall.weekday + 6) % 7;
    const start = new Date(Date.UTC(year, month - 1, day - elapsed));
    year = start.getUTCFullYear();
    month = start.getUTCMonth() + 1;
    day = start.getUTCDate();
  } else if (period === "month") {
    day = 1;
  } else if (period === "year") {
    day = 1;
    month = 1;
  }

  return zonedMidnight(year, month, day, timezone);
}

/** Returns the start of `n` days ago in the given timezone. */
export function startNDaysAgoInTz(n: number, timezone: string = "Asia/Karachi"): Date {
  const start = new Date(startOfTodayInTz(timezone));
  start.setUTCDate(start.getUTCDate() - n);
  return start;
}

// ────────────────────────────────────────────────────────────────────────────
// V12: Additional date-range helpers for complete filter support
// ────────────────────────────────────────────────────────────────────────────

/** Returns the start of yesterday in the given timezone. */
export function startOfYesterdayInTz(timezone: string = "Asia/Karachi"): Date {
  return startNDaysAgoInTz(1, timezone);
}

/** Returns the end of yesterday (start of today, exclusive) in the given timezone. */
export function endOfYesterdayInTz(timezone: string = "Asia/Karachi"): Date {
  return startOfTodayInTz(timezone);
}

/** Returns the start of last week (the Monday of the previous week) in the given TZ. */
export function startOfLastWeekInTz(timezone: string = "Asia/Karachi"): Date {
  const thisWeekStart = startOfWeekInTz(timezone);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  return lastWeekStart;
}

/** Returns the end of last week (start of this week, exclusive) in the given TZ. */
export function endOfLastWeekInTz(timezone: string = "Asia/Karachi"): Date {
  return startOfWeekInTz(timezone);
}

/** Returns the start of last month (first day of previous month) in the given TZ. */
export function startOfLastMonthInTz(timezone: string = "Asia/Karachi"): Date {
  // Computed from the calendar month, NOT by subtracting a month from this
  // month's start. That older approach was off by one day: the start of this
  // month is a UTC instant that already falls in the PREVIOUS UTC month
  // (Nov 1 Karachi = Oct 31 UTC), so subtracting a UTC month rolled over an
  // extra day and "Last month" began on the 2nd instead of the 1st.
  const wall = wallParts(new Date(), timezone);
  const previous = wall.month - 1; // 1-based
  const year = previous === 0 ? wall.year - 1 : wall.year;
  const month = previous === 0 ? 12 : previous;
  return zonedMidnight(year, month, 1, timezone);
}

/** Returns the end of last month (start of this month, exclusive) in the given TZ. */
export function endOfLastMonthInTz(timezone: string = "Asia/Karachi"): Date {
  return startOfMonthInTz(timezone);
}

/** Returns the start of the current year (Jan 1) in the given timezone. */
export function startOfYearInTz(timezone: string = "Asia/Karachi"): Date {
  return startOfPeriodInTz(timezone, "year");
}

/**
 * Parse a `YYYY-MM-DD` calendar date into the UTC moment that is midnight of
 * that day in the business timezone. Returns null when the string is not a
 * real calendar date (e.g. "2026-02-31").
 *
 * Used by reports so a custom range means the same thing to the user as it
 * does to the database, regardless of the server's own timezone.
 */
export function startOfDayInTz(
  dateStr: string,
  timezone: string = "Asia/Karachi",
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const asUtc = new Date(Date.UTC(year, month - 1, day));
  // Reject overflow like 2026-02-31 (which JS would roll into March).
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    return null;
  }

  return zonedMidnight(year, month, day, timezone);
}

/** `YYYY-MM-DD` for a given instant, in the business timezone. */
export function dateStringInTz(
  date: Date = new Date(),
  timezone: string = "Asia/Karachi",
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's calendar date (`YYYY-MM-DD`) in the business timezone. */
export function todayDateStringInTz(timezone: string = "Asia/Karachi"): string {
  return dateStringInTz(new Date(), timezone);
}

/**
 * Compute a date range { start, end } for a given filter preset.
 * Returns { start: Date, end?: Date } where:
 *   - start = inclusive start of the period
 *   - end = exclusive end (start of the NEXT period), or undefined for "all"
 *
 * This is the single source of truth for date-range computation across all
 * filter implementations in the app. All services should use this to ensure
 * consistent filtering.
 */
export function getDateRangeForFilter(
  filter: string,
  timezone: string = "Asia/Karachi",
): { start: Date; end?: Date } {
  switch (filter) {
    case "today":
      return { start: startOfTodayInTz(timezone) };
    case "yesterday":
      return { start: startOfYesterdayInTz(timezone), end: endOfYesterdayInTz(timezone) };
    case "week":
      return { start: startOfWeekInTz(timezone) };
    case "lastWeek":
      return { start: startOfLastWeekInTz(timezone), end: endOfLastWeekInTz(timezone) };
    case "month":
      return { start: startOfMonthInTz(timezone) };
    case "lastMonth":
      return { start: startOfLastMonthInTz(timezone), end: endOfLastMonthInTz(timezone) };
    case "year":
      return { start: startOfYearInTz(timezone) };
    case "all":
      return { start: new Date(0) }; // epoch = include everything
    default:
      return { start: new Date(0) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Display formatters
// ────────────────────────────────────────────────────────────────────────────

/** Format a Date for display in the business TZ: "16 Sep 2026, 2:30 PM".
 *  Accepts Date, string (ISO), or number (epoch). Normalizes to Date first. */
export function formatDateTime(date: Date | string | number, timezone: string = "Asia/Karachi"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Format a Date for display: "16 Sep 2026" (no time).
 *  Accepts Date, string (ISO), or number (epoch). */
export function formatDate(date: Date | string | number, timezone: string = "Asia/Karachi"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Format a Date for display: "2:30 PM" (no date).
 *  Accepts Date, string (ISO), or number (epoch). */
export function formatTime(date: Date | string | number, timezone: string = "Asia/Karachi"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Relative time: "5 min ago", "2 hours ago", "Yesterday", or absolute date.
 *  Accepts Date, string (ISO), or number (epoch). When `tr` is given (the
 *  app's tParams), the phrases are localised (English/Urdu). */
export type RelativeTranslator = (
  key: TranslationKey,
  params: Record<string, string | number>,
) => string;

export function formatRelative(
  date: Date | string | number,
  timezone: string = "Asia/Karachi",
  tr?: RelativeTranslator,
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return tr ? tr("time.justNow", {}) : "just now";
  if (diffMin < 60) return tr ? tr("time.minutesAgo", { n: diffMin }) : `${diffMin} min ago`;
  if (diffHr < 24) return tr ? tr("time.hoursAgo", { n: diffHr }) : `${diffHr} hr ago`;
  if (diffDay === 1) return tr ? tr("time.yesterday", {}) : "yesterday";
  if (diffDay < 7) return tr ? tr("time.daysAgo", { n: diffDay }) : `${diffDay} days ago`;
  return formatDate(d, timezone);
}
