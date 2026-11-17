/**
 * Verify the landing-page / auth-page redirect behaviour with a REAL session.
 *
 * Signed in:  "/" shows the marketing page (no redirect); /login and /register
 *             send you to the dashboard.
 * Signed out: all three show their own page.
 *
 * Run: npx tsx scripts/qa-nav-redirect.mts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const BASE = "https://dukhata.com";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(48)} got ${String(actual)}${ok ? "" : `  expected ${String(expected)}`}`);
}

async function page(p: string, cookie?: string) {
  const res = await fetch(`${BASE}${p}?cb=${Date.now()}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
  const body = res.status === 200 ? await res.text() : "";
  // A redirect may be relative ("/dashboard") or absolute. Both are valid, and
  // browsers resolve either; compare the resolved form.
  const location = res.headers.get("location");
  return {
    status: res.status,
    location: location ? new URL(location, BASE).toString() : null,
    body,
  };
}

console.log("--- signed OUT ---");
{
  const home = await page("/");
  check("/ shows the marketing page", home.status, 200);
  check("/ has the marketing hero", /digital khata app for Pakistani shops/i.test(home.body), true);
  check("/login is reachable", (await page("/login")).status, 200);
  check("/register is reachable", (await page("/register")).status, 200);
}

const stamp = Date.now();
const email = `qa.nav.${stamp}@dukhata-qa.test`;
const password = "Qa!" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + "A9";

const reg = await fetch(`${BASE}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "QA Nav", email, password, plan: "trial" }),
});
const raw = reg.headers.getSetCookie ? reg.headers.getSetCookie() : [reg.headers.get("set-cookie")].filter(Boolean);
const cookie = raw.map((c) => c.split(";")[0]).join("; ");
check("throwaway account created", reg.status, 200);

console.log("\n--- signed IN ---");
{
  const home = await page("/", cookie);
  check("/ does NOT redirect", home.status, 200);
  check("/ still shows the marketing page", /digital khata app for Pakistani shops/i.test(home.body), true);

  const login = await page("/login", cookie);
  check("/login redirects", login.status, 307);
  check("/login -> dashboard", login.location, `${BASE}/dashboard`);

  const register = await page("/register", cookie);
  check("/register redirects", register.status, 307);
  check("/register -> dashboard", register.location, `${BASE}/dashboard`);

  const start = await page("/start", cookie);
  check("/start (app entry) -> dashboard", start.location, `${BASE}/dashboard`);
}

console.log("\n--- cleanup ---");
const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
if (user) await prisma.user.delete({ where: { id: user.id } });
check("qa account deleted", await prisma.user.count({ where: { email } }), 0);
await prisma.$disconnect();

console.log();
console.log(failures === 0 ? "all navigation checks pass" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);