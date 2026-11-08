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
 * Core: compute the start of a period (day/week/month) in a given timezone.
 *
 * Uses Intl.DateTimeFormat to get the current date components in the target
 * TZ, then constructs a UTC Date for midnight of that day, then converts
 * back to the correct UTC moment by applying the TZ offset.
 *
 * This is more robust than the previous approach because:
 * 1. No manual offset arithmetic (which had sign errors in edge cases)
 * 2. Uses the V8 engine's built-in TZ database (always correct)
 * 3. Works the same in Node.js, Vercel serverless, and Edge runtime
 */
function startOfPeriodInTz(
  timezone: string,
  period: "day" | "week" | "month" | "year",
): Date {
  const now = new Date();

  // Get current date parts in the target timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",  // "Mon", "Tue", etc.
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string): number =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const year = get("year");
  const month = get("month");  // 1-12
  const day = get("day");      // 1-31
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";

  // Compute the target day (for week, go back to Monday)
  let targetDay = day;
  let targetMonth = month;
  let targetYear = year;

  if (period === "week") {
    // Day of week: Mon=0, Tue=1, ..., Sun=6
    const dayMap: Record<string, number> = {
      Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
    };
    const dow = dayMap[weekday] ?? 0;

    if (dow > 0) {
      // Go back `dow` days to reach Monday
      // We construct a Date in UTC (treating the TZ date as if it were UTC),
      // subtract days, then convert back.
      const asIfUtc = Date.UTC(year, month - 1, day);
      const mondayMs = asIfUtc - dow * 24 * 60 * 60 * 1000;
      const monday = new Date(mondayMs);
      targetYear = monday.getUTCFullYear();
      targetMonth = monday.getUTCMonth() + 1;
      targetDay = monday.getUTCDate();
    }
  } else if (period === "month") {
    targetDay = 1;
  } else if (period === "year") {
    targetDay = 1;
    targetMonth = 1;
  }
  // For "day", targetDay stays as-is

  // Now construct midnight for the target date IN the target timezone.
  // We need to figure out what UTC moment corresponds to midnight in the TZ.
  //
  // Strategy: create a Date for "midnight UTC" of the target date, then
  // check what time that is in the target TZ. The difference tells us
  // the offset, which we apply to get the correct UTC moment.
  //
  // Example: target = Sep 22, Karachi (UTC+5)
  //   midnight UTC Sep 22 = Sep 22 00:00 UTC
  //   In Karachi, that's Sep 22 05:00 (ahead of midnight)
  //   So midnight Karachi = Sep 21 19:00 UTC
  //   Offset = +5h → we subtract 5h from midnight UTC

  // Format midnight-UTC in the target TZ to find the offset
  const midnightUtc = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay));
  const tzAtMidnightUtc = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).formatToParts(midnightUtc);

  const tzHour = parseInt(tzAtMidnightUtc.find(p => p.type === "hour")?.value ?? "0", 10);
  const tzMinute = parseInt(tzAtMidnightUtc.find(p => p.type === "minute")?.value ?? "0", 10);

  // How many minutes ahead/behind is the TZ at midnight UTC?
  // If TZ shows 05:00 at midnight UTC, the TZ is 5 hours ahead.
  // Midnight in TZ = midnight UTC - 5 hours.
  const tzMinutesFromMidnight = tzHour * 60 + tzMinute;
  const offsetMinutes = tzMinutesFromMidnight;

  return new Date(midnightUtc.getTime() - offsetMinutes * 60000);
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
  const thisMonthStart = startOfMonthInTz(timezone);
  const lastMonthStart = new Date(thisMonthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);
  return lastMonthStart;
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

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(asUtc);

  const get = (type: string): number =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const offsetMinutes = get("hour") * 60 + get("minute");
  return new Date(asUtc.getTime() - offsetMinutes * 60000);
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
 *  Accepts Date, string (ISO), or number (epoch). */
export function formatRelative(date: Date | string | number, timezone: string = "Asia/Karachi"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return formatDate(d, timezone);
}
