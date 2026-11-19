/**
 * Native-client auth contract.
 *
 * The native app (React Native) has no cookie jar. It needs:
 *   1. the JWT in the body of login/register when it asks with `x-client: mobile`;
 *   2. `Authorization: Bearer <jwt>` to be accepted by the proxy and by
 *      `getCurrentUserId` on protected routes.
 *
 * Meanwhile the web app must keep exactly what it had: an httpOnly cookie and
 * **no token in the response body**, because a token in JS would undo the
 * httpOnly protection.
 *
 * Run with: npx tsx scripts/qa-mobile-auth.mts
 * Test account uses `@dukhata-qa.test` and is deleted, with its trial claim,
 * at the end.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashTrialEmail } from "../src/lib/services/trial-claim-hash";

const BASE = "https://dukhata.com";

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
    `${ok ? "PASS" : "FAIL"}  ${label.padEnd(54)} got ${String(actual)}${
      ok ? "" : `  expected ${String(expected)}`
    }`,
  );
}

type Reply = { status: number; json: any; cookie: string; setCookie: string[] };

async function req(
  method: string,
  p: string,
  opts: { body?: unknown; headers?: Record<string, string>; cookie?: string } = {},
): Promise<Reply> {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const setCookie = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean as unknown as (v: string | null) => boolean) as string[];
  return {
    status: res.status,
    json,
    cookie: setCookie.map((c) => c.split(";")[0]).join("; "),
    setCookie,
  };
}

const stamp = Date.now();
const email = `qa.mobile.${stamp}@dukhata-qa.test`;
const password = "Qa!mobile" + Math.random().toString(36).slice(2) + "A9";
const prisma = new PrismaClient();

async function main() {
  try {
    // ── register: browser and app get different bodies ────────────────────
    console.log("1. registration");
    const browser = await req("POST", "/api/auth/register", {
      body: { name: "QA Mobile", email, password, plan: "trial" },
    });
    check("browser register status", browser.status, 200);
    check("browser: no token in body", browser.json?.data?.token, undefined);
    check("browser: cookie set", browser.cookie.includes("dk_auth_token="), true);

    // Same address, so start from an app login instead of a second register.
    console.log("\n2. login as the app");
    const app = await req("POST", "/api/auth/login", {
      body: { email, password },
      headers: { "x-client": "mobile" },
    });
    check("app login status", app.status, 200);
    const token = app.json?.data?.token;
    check("app receives a token", typeof token, "string");
    check("token looks like a JWT", String(token).split(".").length, 3);

    console.log("\n3. login as a browser");
    const web = await req("POST", "/api/auth/login", { body: { email, password } });
    check("browser login status", web.status, 200);
    check("browser: no token in body", web.json?.data?.token, undefined);
    check("browser: cookie set", web.cookie.includes("dk_auth_token="), true);

    // ── protected route: both carriers must work ───────────────────────────
    console.log("\n4. protected route");
    check(
      "Bearer token accepted",
      (await req("GET", "/api/customers", { headers: { Authorization: `Bearer ${token}` } }))
        .status,
      200,
    );
    check(
      "cookie accepted (unchanged)",
      (await req("GET", "/api/customers", { cookie: browser.cookie })).status,
      200,
    );
    check("no credential rejected", (await req("GET", "/api/customers")).status, 401);
    check(
      "garbage bearer rejected",
      (await req("GET", "/api/customers", { headers: { Authorization: "Bearer not.a.jwt" } }))
        .status,
      401,
    );
    check(
      "empty bearer falls through to cookie",
      (
        await req("GET", "/api/customers", {
          headers: { Authorization: "Bearer " },
          cookie: browser.cookie,
        })
      ).status,
      200,
    );

    // A forged token with a valid shape but bad signature must fail.
    const [h, , s] = String(token).split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ userId: "someone-else", exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    check(
      "forged signature rejected",
      (
        await req("GET", "/api/customers", {
          headers: { Authorization: `Bearer ${h}.${forgedBody}.${s}` },
        })
      ).status,
      401,
    );

    console.log("\n5. token works on a write and on /api/auth/me");
    const created = await req("POST", "/api/customers", {
      headers: { Authorization: `Bearer ${token}` },
      body: { name: "Bearer Customer", phone: "03001234567" },
    });
    check("create customer status", created.status, 201);
    const me = await req("GET", "/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    check("me status", me.status, 200);
    check("me rehydrates the session from the Bearer token", me.json?.data?.user?.email, email);
  } finally {
    console.log("\n6. cleanup");
    await prisma.user.deleteMany({ where: { email } });
    await prisma.trialClaim.deleteMany({ where: { emailHash: hashTrialEmail(email) } });
    check("qa user deleted", await prisma.user.count({ where: { email } }), 0);
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
    console.log(failures === 0 ? "all mobile-auth checks pass" : `${failures} check(s) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });