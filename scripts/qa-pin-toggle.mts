/**
 * End-to-end test of the PIN switch, against the real API.
 *
 * Creates a throwaway account, turns the PIN on, checks the lock status the app
 * reads, tries to disable it with a WRONG pin (must fail), disables it with the
 * right one, and confirms the status says "off" so the next app open will not
 * ask. The account is deleted at the end (Prisma, cascade) either way.
 *
 * Run: npx tsx scripts/qa-pin-toggle.mts
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
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} got ${String(actual)}${ok ? "" : `  expected ${String(expected)}`}`);
}

const cookieFrom = (res: Response) => {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  return raw.map((c) => c.split(";")[0]).join("; ");
};

async function req(method: string, p: string, body: unknown, cookie?: string) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, cookie: cookieFrom(res) };
}

const stamp = Date.now();
const email = `qa.pin.${stamp}@dukhata-qa.test`;
const password = "Qa!" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + "A9";

console.log("1. create a throwaway account");
const reg = await req("POST", "/api/auth/register", { name: "QA Pin", email, password, plan: "trial" });
check("account created", reg.status, 200);
const cookie = reg.cookie;
if (!cookie) {
  console.log("no session cookie - cannot continue");
  process.exit(1);
}

console.log("\n2. PIN is off by default");
const status0 = await req("GET", "/api/auth/status", null, cookie);
check("hasPin before enabling", status0.json?.data?.hasPin, false);

console.log("\n3. turn it ON");
const on = await req("POST", "/api/settings/pin", { pin: "1234" }, cookie);
check("set-pin request ok", on.status, 200);
check("set-pin returns hasPin", on.json?.data?.hasPin, true);

const status1 = await req("GET", "/api/auth/status", null, cookie);
check("hasPin after enabling", status1.json?.data?.hasPin, true);
check("session not unlocked while locked", status1.json?.data?.unlocked, false);

console.log("\n4. a wrong PIN must NOT turn it off");
const wrong = await req("DELETE", "/api/settings/pin", { currentPin: "0000" }, cookie);
check("wrong pin rejected", wrong.status >= 400, true);
const status2 = await req("GET", "/api/auth/status", null, cookie);
check("still on after a wrong PIN", status2.json?.data?.hasPin, true);

console.log("\n5. the right PIN turns it OFF");
const off = await req("DELETE", "/api/settings/pin", { currentPin: "1234" }, cookie);
check("remove-pin request ok", off.status, 200);
check("remove-pin returns hasPin", off.json?.data?.hasPin, false);

const status3 = await req("GET", "/api/auth/status", null, cookie);
check("hasPin after disabling", status3.json?.data?.hasPin, false);
check("next app open will not ask", status3.json?.data?.unlocked, true);

console.log("\n6. turning it on again works");
const on2 = await req("POST", "/api/settings/pin", { pin: "987654" }, cookie);
check("re-enable ok", on2.status, 200);
const status4 = await req("GET", "/api/auth/status", null, cookie);
check("hasPin again", status4.json?.data?.hasPin, true);

console.log("\n7. cleanup");
const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
if (user) await prisma.user.delete({ where: { id: user.id } });
const leftover = await prisma.user.count({ where: { email } });
await prisma.$disconnect();
check("qa account deleted", leftover, 0);

console.log();
console.log(failures === 0 ? "all PIN switch checks pass" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);