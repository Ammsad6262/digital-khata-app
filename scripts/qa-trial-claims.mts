/**
 * Trial-claim regression test.
 *
 * The bug: a trial lived only on `UserSubscription`, which is deleted with the
 * account, so an owner could delete their account and sign up again with the
 * same email for a brand-new 14-day trial — forever.
 *
 * This proves three things:
 *   1. the address-normalising rule (offline, no database needed);
 *   2. the claim survives account deletion;
 *   3. a returning address is created without a trial, cannot reach the app,
 *      but can still sign in and reach the code page.
 *
 * Run against the deployed app:   npx tsx scripts/qa-trial-claims.mts
 * Only the pure-function checks:  npx tsx scripts/qa-trial-claims.mts --offline
 *
 * Test accounts use `@dukhata-qa.test` (an unroutable domain) and are deleted,
 * together with their claims, at the end.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  hashTrialEmail,
  normalizeEmailForTrial,
} from "../src/lib/services/trial-claim-hash";

const BASE = "https://dukhata.com";
const offline = process.argv.includes("--offline");

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (!existsSync(full)) continue;
  for (const raw of readFileSync(full, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label.padEnd(56)} got ${String(actual)}${
      ok ? "" : `  expected ${String(expected)}`
    }`,
  );
}

// ── 1. the normalising rule (always runs) ───────────────────────────────────

console.log("1. address normalisation");
check("gmail dots and tags fold", normalizeEmailForTrial("A.B+c@Gmail.com"), "ab@gmail.com");
check("googlemail is gmail", normalizeEmailForTrial("ab@googlemail.com"), "ab@gmail.com");
check(
  "other providers keep dots and tags",
  normalizeEmailForTrial("john.doe+tag@example.com"),
  "john.doe+tag@example.com",
);
check("surrounding space and case", normalizeEmailForTrial("  Foo@Example.COM "), "foo@example.com");
check("a.b@gmail and ab+1@gmail hash alike", hashTrialEmail("a.b@gmail.com"), hashTrialEmail("ab+1@gmail.com"));
check("different mailboxes stay different", hashTrialEmail("ab@gmail.com") !== hashTrialEmail("ac@gmail.com"), true);

if (offline) {
  console.log();
  console.log(failures === 0 ? "offline checks pass" : `${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

// ── helpers ─────────────────────────────────────────────────────────────────

const cookieFrom = (res: Response) => {
  const raw = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  return raw.map((c) => c.split(";")[0]).join("; ");
};

async function req(
  method: string,
  p: string,
  body?: unknown,
  cookie?: string,
) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
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
const email = `qa.trial.${stamp}@dukhata-qa.test`;
const password = "Qa!" + Math.random().toString(36).slice(2) + "A9x";
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("\n2. a fresh address gets the trial");
    const first = await req("POST", "/api/auth/register", {
      name: "QA Trial",
      email,
      password,
      plan: "trial",
    });
    check("register status", first.status, 200);
    check("trial granted", first.json?.data?.trialGranted, true);
    check("claim recorded", await prisma.trialClaim.count({ where: { emailHash: hashTrialEmail(email) } }), 1);

    const sub1 = await prisma.userSubscription.findFirst({
      where: { user: { email } },
      select: { status: true },
    });
    check("subscription is TRIAL_ACTIVE", sub1?.status, "TRIAL_ACTIVE");
    check("protected route works", (await req("GET", "/api/customers", undefined, first.cookie)).status, 200);

    console.log("\n3. deleting the account must NOT delete the claim");
    await prisma.user.delete({ where: { email } });
    check("user gone", await prisma.user.count({ where: { email } }), 0);
    check("claim survives deletion", await prisma.trialClaim.count({ where: { emailHash: hashTrialEmail(email) } }), 1);

    console.log("\n4. the same address cannot start a second trial");
    const second = await req("POST", "/api/auth/register", {
      name: "QA Trial Again",
      email,
      password,
      plan: "trial",
    });
    check("register status", second.status, 200);
    check("trial NOT granted", second.json?.data?.trialGranted, false);

    const sub2 = await prisma.userSubscription.findFirst({
      where: { user: { email } },
      select: { status: true },
    });
    check("subscription is UNACTIVATED", sub2?.status, "UNACTIVATED");
    check("app data is blocked", (await req("GET", "/api/customers", undefined, second.cookie)).status, 403);
    check("can still read own account", (await req("GET", "/api/auth/me", undefined, second.cookie)).status, 200);
  } finally {
    console.log("\n5. cleanup");
    await prisma.user.deleteMany({ where: { email } });
    const hash = hashTrialEmail(email);
    await prisma.trialClaim.deleteMany({ where: { emailHash: hash } });
    check("qa user deleted", await prisma.user.count({ where: { email } }), 0);
    check("qa claim deleted", await prisma.trialClaim.count({ where: { emailHash: hash } }), 0);
  }
}

main()
  .catch((error) => {
    failures += 1;
    console.error("\nERROR:", error instanceof Error ? error.message : error);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log();
    console.log(failures === 0 ? "all trial-claim checks pass" : `${failures} check(s) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
