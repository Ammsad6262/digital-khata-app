/**
 * READ-ONLY diagnostic: does the "week" filter really return more than "today"?
 *
 * It calls the same service the API calls, so if the counts differ here the bug
 * is in the UI/cache, and if they are identical the bug is in the query.
 *
 * Run: npx tsx scripts/qa-sales-filter-live.mts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const prisma = new PrismaClient();

const TZ = "Asia/Karachi";
const show = (d: Date | string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));

const users = await prisma.user.findMany({ select: { id: true, email: true } });
console.log("users:", users.map((u) => u.email).join(", "));
console.log();

for (const user of users) {
  const sales = await prisma.sale.findMany({
    where: { userId: user.id, voidedAt: null },
    select: { id: true, date: true, createdAt: true, totalAmount: true },
    orderBy: { date: "desc" },
    take: 200,
  });
  const expenses = await prisma.expense.findMany({
    where: { userId: user.id },
    select: { id: true, date: true, amount: true },
    orderBy: { date: "desc" },
    take: 200,
  });
  if (sales.length === 0 && expenses.length === 0) continue;

  console.log("=".repeat(78));
  console.log("USER", user.email, "-", sales.length, "sales,", expenses.length, "expenses");
  console.log("newest sale   :", sales[0] ? show(sales[0].date) : "-");
  console.log("          createdAt of that one:", sales[0] ? show(sales[0].createdAt) : "-");
  if (sales[1]) console.log("2nd newest    :", show(sales[1].date), " createdAt:", show(sales[1].createdAt));
  if (expenses[0]) console.log("newest expense:", show(expenses[0].date));
  console.log();

  const { getDateRangeForFilter } = await import("../src/lib/utils/date");
  for (const filter of ["today", "week", "month", "all"] as const) {
    const r = getDateRangeForFilter(filter, TZ);
    const nSales = sales.filter((s) => new Date(s.date) >= r.start && (!r.end || new Date(s.date) < r.end)).length;
    const nExp = expenses.filter((e) => new Date(e.date) >= r.start && (!r.end || new Date(e.date) < r.end)).length;
    console.log(`  ${filter.padEnd(6)} start=${show(r.start)}  ->  ${nSales} sales, ${nExp} expenses`);
  }
  console.log();
}

await prisma.$disconnect();
