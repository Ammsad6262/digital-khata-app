/**
 * Date / timezone / money regression tests (pure, no DB).
 *
 * Usage: npx tsx scripts/test-dates.ts
 */

import {
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
  startOfDayInTz,
  dateStringInTz,
  todayDateStringInTz,
  getDateRangeForFilter,
} from "../src/lib/utils/date";
import { formatMoney } from "../src/lib/utils/money";

let pass = 0;
let fail = 0;
const a = (cond: boolean, label: string, detail?: string) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const TZ = "Asia/Karachi";
const timeInTz = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);

// ── start of today ──────────────────────────────────────────────────────────
const sod = startOfTodayInTz(TZ);
a(timeInTz(sod) === "00:00", "startOfTodayInTz is midnight in the business TZ", timeInTz(sod));
a(
  dateStringInTz(sod, TZ) === todayDateStringInTz(TZ),
  "startOfToday's date equals today's date string",
  `${dateStringInTz(sod, TZ)} vs ${todayDateStringInTz(TZ)}`,
);

// ── start of week is Monday at midnight ─────────────────────────────────────
const sow = startOfWeekInTz(TZ);
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(sow);
a(weekday === "Mon", "startOfWeekInTz is a Monday", weekday);
a(timeInTz(sow) === "00:00", "startOfWeek is midnight", timeInTz(sow));

// ── start of month is the 1st ───────────────────────────────────────────────
const som = startOfMonthInTz(TZ);
a(
  Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" }).format(som)) === 1,
  "startOfMonthInTz is the 1st",
);

// ── calendar-date validation ────────────────────────────────────────────────
a(startOfDayInTz("2026-02-31", TZ) === null, "2026-02-31 is rejected");
a(startOfDayInTz("2026-13-01", TZ) === null, "2026-13-01 is rejected");
a(startOfDayInTz("nonsense", TZ) === null, "non-date is rejected");
a(startOfDayInTz("2026-02-28", TZ) instanceof Date, "2026-02-28 is accepted");
a(startOfDayInTz("2024-02-29", TZ) instanceof Date, "leap day 2024-02-29 is accepted");
a(timeInTz(startOfDayInTz("2026-07-04", TZ)!) === "00:00", "startOfDayInTz is midnight in TZ");

// ── ranges are ordered, with an exclusive end ───────────────────────────────
for (const f of ["yesterday", "lastWeek", "lastMonth"]) {
  const r = getDateRangeForFilter(f, TZ);
  a(!!r.end && r.end.getTime() > r.start.getTime(), `${f}: end is after start`);
}
const y = getDateRangeForFilter("yesterday", TZ);
a(dateStringInTz(y.end!, TZ) === todayDateStringInTz(TZ), "yesterday end == start of today");
const lw = getDateRangeForFilter("lastWeek", TZ);
a(new Date(lw.end!).getTime() === sow.getTime(), "lastWeek end == start of this week");

// ── money formatting ────────────────────────────────────────────────────────
a(formatMoney(1234.5) === "Rs. 1,234.50", "formatMoney 1234.5", formatMoney(1234.5));
a(formatMoney(-1234.5) === "-Rs. 1,234.50", "formatMoney negative", formatMoney(-1234.5));
a(formatMoney(null) === "Rs. 0.00", "formatMoney null", formatMoney(null));
a(formatMoney(0) === "Rs. 0.00", "formatMoney zero", formatMoney(0));
a(formatMoney(1000000) === "Rs. 1,000,000.00", "formatMoney million", formatMoney(1000000));
a(formatMoney("1234.5") === "Rs. 1,234.50", "formatMoney string", formatMoney("1234.5"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);