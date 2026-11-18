/**
 * Live functional pass over the flows touched recently.
 *
 * Creates a throwaway account and exercises: register, add a customer with NO
 * phone (the fix), add a product, list them, an invalid redeem code, and the
 * new email-confirmation guards on delete/clear/export. Cleans up afterwards.
 *
 * Run: npx tsx scripts/qa-app-flows.mts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashTrialEmail } from "../src/lib/services/trial-claim-hash";

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
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} got ${String(actual)}${ok ? "" : `  expected ${String(expected)}`}`);
}

const cookieFrom = (res: Response) => {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  return raw.map((c) => c.split(";")[0]).join("; ");
};

async function req(method: string, p: string, body?: unknown, cookie?: string, headers?: Record<string, string>) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, cookie: cookieFrom(res) };
}

const stamp = Date.now();
const email = `qa.flows.${stamp}@dukhata-qa.test`;
const password = "Qa!" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + "A9";

let cookie = "";
let userId = "";
let cleanupNeeded = false;

try {
  console.log("1. register");
  const reg = await req("POST", "/api/auth/register", { name: "QA Flows", email, password, plan: "trial" });
  check("register status", reg.status, 200);
  cookie = reg.cookie;
  cleanupNeeded = true;
  if (!cookie) throw new Error("no session cookie");

  console.log("\n2. add a customer with NO phone (the fixed bug)");
  const noPhone = await req("POST", "/api/customers", { name: `No Phone ${stamp}` }, cookie);
  check("customer without phone accepted (2xx)", noPhone.status < 300, true);
  check("phone stored as null", noPhone.json?.data?.phone ?? null, null);

  console.log("\n3. add a customer with a phone");
  const withPhone = await req("POST", "/api/customers", { name: `With Phone ${stamp}`, phone: "03001234567" }, cookie);
  check("customer with phone accepted (2xx)", withPhone.status < 300, true);
  check("phone stored", withPhone.json?.data?.phone, "03001234567");

  console.log("\n4. a too-short phone is still rejected");
  const badPhone = await req("POST", "/api/customers", { name: `Bad ${stamp}`, phone: "123" }, cookie);
  check("short phone rejected", badPhone.status >= 400, true);

  console.log("\n5. add a product and list it");
  const product = await req(
    "POST",
    "/api/products",
    { name: `QA Rice ${stamp}`, purchasePrice: 100, sellingPrice: 130 },
    cookie,
  );
  check("product created (2xx)", product.status < 300, true);
  const list = await req("GET", "/api/customers", undefined, cookie);
  check("customer list ok", list.status, 200);
  check("both customers listed", Array.isArray(list.json?.data) && list.json.data.length >= 2, true);

  console.log("\n6. an invalid redeem code is a clean 400, not a 500");
  const redeem = await req("POST", "/api/subscription/redeem", { code: "DKH-M-AAAA-BBBB-CCCC" }, cookie);
  check("invalid code rejected cleanly", redeem.status, 400);

  console.log("\n7. destructive actions are blocked without the emailed code");
  const del = await req("DELETE", "/api/account", { password }, cookie);
  check("delete account needs confirmation", del.status, 400);
  const clear = await req("DELETE", "/api/settings/clear-all", { confirm: true }, cookie);
  check("clear data needs confirmation", clear.status, 400);
  const exp = await req("GET", "/api/backup/export", undefined, cookie);
  check("export needs confirmation", exp.status, 400);
  const csv = await req("GET", "/api/backup/csv/customers", undefined, cookie);
  check("csv export needs confirmation", csv.status, 400);

  console.log("\n8. the account still exists after the blocked attempts");
  const me = await req("GET", "/api/auth/me", undefined, cookie);
  check("still signed in", me.status, 200);
} finally {
  if (cleanupNeeded) {
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    userId = user?.id ?? "";
    if (userId) await prisma.user.delete({ where: { id: userId } });
    const leftover = await prisma.user.count({ where: { email } });
    // Registration records a trial claim that deliberately outlives the user,
    // so a test account would otherwise leave a permanent claim behind.
    await prisma.trialClaim.deleteMany({
      where: { emailHash: hashTrialEmail(email) },
    });
    await prisma.$disconnect();
    console.log("\n9. cleanup");
    check("qa account deleted", leftover, 0);
  }
}

console.log();
console.log(failures === 0 ? "all app-flow checks pass" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);