/**
 * Assert the date ranges are what their names claim.
 *
 * Every period filter in the app resolves to one of these; if any is off, the
 * owner sees the wrong records â€” which is exactly the reported "This Week shows
 * only today" class of bug. Correct values for any known "today" are computed
 * independently below rather than copied from the implementation.
 *
 * Run: npx tsx scripts/qa-date-ranges-assert.mts
 */
import {
  getDateRangeForFilter,
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
  startOfLastMonthInTz,
  startOfLastWeekInTz,
} from "../src/lib/utils/date";
import { rangeForPreset } from "../src/lib/services/reports";

const TZ = "Asia/Karachi";

/** Format a Date as a Karachi calendar day, e.g. 2026-11-17. */
function dayInTz(d: Date, tz = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dayOf(start: Date, tz = TZ): string {
  return dayInTz(new Date(start), tz);
}

// What "the truth" should be for the current moment, computed from scratch.
const now = new Date();
const todayStr = dayInTz(now);
const [y, m, d] = todayStr.split("-").map(Number);

// weekday in Karachi, Sunday-first (the app's week now starts Sunday)
const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const dow = dowMap[wd] ?? 0;
const weekStart = new Date(Date.UTC(y, m - 1, d - dow));
const weekStartStr = weekStart.toISOString().slice(0, 10);
const monthStartStr = `${y}-${String(m).padStart(2, "0")}-01`;

const prevMonth = new Date(Date.UTC(y, m - 2, 1));
const lastMonthStartStr = prevMonth.toISOString().slice(0, 10);
const lastMonthEnd = new Date(Date.UTC(y, m - 1, 0)); // day 0 = last day of prev month
const lastMonthEndStr = lastMonthEnd.toISOString().slice(0, 10);

const daysAgo = (n: number) => new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
const lastWeekStart = new Date(Date.UTC(y, m - 1, d - dow - 7)).toISOString().slice(0, 10);

let failures = 0;
function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(34)} got ${actual}   expected ${expected}`);
}

console.log(`today (Karachi) = ${todayStr} (${wd})`);
console.log();

console.log("--- getDateRangeForFilter (Sales / Expenses / Payments lists) ---");
check("today.start", dayOf(getDateRangeForFilter("today", TZ).start), todayStr);
check("week.start", dayOf(getDateRangeForFilter("week", TZ).start), weekStartStr);
check("lastWeek.start", dayOf(getDateRangeForFilter("lastWeek", TZ).start), lastWeekStart);
check("month.start", dayOf(getDateRangeForFilter("month", TZ).start), monthStartStr);
check(
  "lastMonth.start",
  dayOf(getDateRangeForFilter("lastMonth", TZ).start),
  lastMonthStartStr,
);
check(
  "lastMonth.end (exclusive)",
  dayOf(getDateRangeForFilter("lastMonth", TZ).end as Date),
  monthStartStr,
);
console.log();

console.log("--- Reports presets ---");
for (const [preset, expFrom, expTo] of [
  ["today", todayStr, todayStr],
  ["week", weekStartStr, todayStr],
  ["month", monthStartStr, todayStr],
  ["lastMonth", lastMonthStartStr, lastMonthEndStr],
  ["last7", daysAgo(6), todayStr],
  ["last30", daysAgo(29), todayStr],
] as const) {
  const r = rangeForPreset(preset, TZ);
  if (!r) {
    failures += 1;
    console.log(`FAIL  ${preset.padEnd(34)} returned null`);
    continue;
  }
  check(`${preset}.from`, r.from, expFrom);
  check(`${preset}.to`, r.to, expTo);
}
console.log();

console.log("--- the same helpers in a NEGATIVE-offset timezone (latent bug) ---");
const nyStart = startOfWeekInTz("America/New_York");
const nyToday = startOfTodayInTz("America/New_York");
console.log(`  America/New_York startOfToday = ${nyToday.toISOString()}`);
console.log(`  expected start of that day    = ${dayInTz(nyToday, "America/New_York")}T00:00 local`);
console.log(`  New_York week start           = ${nyStart.toISOString()} (${dayInTz(nyStart, "America/New_York")})`);

console.log();
console.log(failures === 0 ? "all ranges correct" : `${failures} range(s) WRONG`);
process.exit(failures === 0 ? 0 : 1);
