/**
 * Print the real date ranges the API uses, and test the owner's exact report:
 * "a sale yesterday does not show under This Week".
 *
 * Run: npx tsx scripts/qa-date-ranges.mts
 */
import {
  getDateRangeForFilter,
  startOfTodayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
  startOfYesterdayInTz,
  endOfYesterdayInTz,
} from "../src/lib/utils/date";

const TZ = "Asia/Karachi";
const fmt = (d: Date | undefined) =>
  d === undefined
    ? "(none)"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);

console.log("now (Karachi)      :", fmt(new Date()));
console.log("start of today     :", fmt(startOfTodayInTz(TZ)));
console.log("start of week (Mon):", fmt(startOfWeekInTz(TZ)));
console.log("start of month     :", fmt(startOfMonthInTz(TZ)));
console.log();

for (const filter of ["today", "yesterday", "week", "lastWeek", "month", "lastMonth", "all"]) {
  const r = getDateRangeForFilter(filter, TZ);
  console.log(`filter ${filter.padEnd(10)} start=${fmt(r.start)}  end=${fmt(r.end)}`);
}

console.log();
// The owner's report: a sale made yesterday should be visible under "This Week".
const yStart = startOfYesterdayInTz(TZ);
const yEnd = endOfYesterdayInTz(TZ);
const week = getDateRangeForFilter("week", TZ);
const month = getDateRangeForFilter("month", TZ);
const today = getDateRangeForFilter("today", TZ);

// A sale at 11:41am yesterday, Karachi time
const saleYesterday = new Date(yStart.getTime() + 11 * 3600 * 1000 + 41 * 60 * 1000);

console.log("a sale made at     :", fmt(saleYesterday), " (yesterday, 11:41am)");
console.log("  inside 'today'   :", saleYesterday >= today.start ? "YES" : "no");
console.log("  inside 'week'    :", saleYesterday >= week.start ? "YES" : "no  <-- the reported bug");
console.log("  inside 'month'   :", saleYesterday >= month.start ? "YES" : "no");
console.log(
  "  stale-cache risk : the today filter has start",
  fmt(today.start),
  "and the week filter has start",
  fmt(week.start),
);
