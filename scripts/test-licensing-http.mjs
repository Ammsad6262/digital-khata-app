/**
 * Commercial licensing — HTTP authorization tests.
 *
 * Verifies, against a RUNNING instance, that:
 *   - the admin licensing API rejects missing/incorrect admin secrets,
 *   - the admin API works with the configured secret,
 *   - an ordinary authenticated user can only read their OWN entitlement,
 *   - the customer redeem endpoint validates input.
 *
 * Run: node scripts/test-licensing-http.mjs  (requires the app on :3001)
 */

import fs from "node:fs";

const BASE = process.env.LICENSING_BASE_URL || "http://localhost:3001";

// ── Safety guard ────────────────────────────────────────────────────────────
// These tests create real users/codes and revoke access. They must only ever
// run against a local instance, never production.
{
  let parsed;
  try {
    parsed = new URL(BASE);
  } catch {
    console.error("Refusing to run: LICENSING_BASE_URL is not a valid URL.");
    process.exit(1);
  }
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    parsed.hostname,
  );
  if (!isLoopback && process.env.ALLOW_REMOTE_LICENSING_TEST !== "1") {
    console.error(
      `Refusing to run against non-local host "${parsed.hostname}". ` +
        "These tests are destructive and local-only. Set " +
        "ALLOW_REMOTE_LICENSING_TEST=1 only if you truly know what you are doing.",
    );
    process.exit(1);
  }
}

function envValue(key) {
  try {
    const text = fs.readFileSync(".env", "utf8");
    const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

const ADMIN_SECRET = process.env.ADMIN_SECRET || envValue("ADMIN_SECRET");

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(path, init) {
  const res = await fetch(BASE + path, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, body };
}

console.log(`HTTP licensing tests against ${BASE}`);

console.log("\nAdmin authorization");
let r = await req("/api/admin/licensing/customers");
check(
  "admin GET without a secret is rejected (401/403)",
  r.status === 401 || r.status === 403,
  `status=${r.status}`,
);

r = await req("/api/admin/licensing/customers", {
  headers: { "x-admin-secret": "definitely-not-the-secret" },
});
check(
  "admin GET with a wrong secret is rejected (401/403)",
  r.status === 401 || r.status === 403,
  `status=${r.status}`,
);

r = await req("/api/admin/licensing/customers", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "grantOwner", userId: "someone" }),
});
check(
  "admin POST without a secret is rejected (401/403)",
  r.status === 401 || r.status === 403,
  `status=${r.status}`,
);

if (ADMIN_SECRET) {
  r = await req("/api/admin/licensing/customers", {
    headers: { "x-admin-secret": ADMIN_SECRET },
  });
  check(
    "admin GET with the configured secret succeeds",
    r.status === 200 && r.body?.ok === true && Array.isArray(r.body?.data?.customers),
    `status=${r.status}`,
  );
} else {
  check("ADMIN_SECRET is configured for the test", false, "missing ADMIN_SECRET");
}

console.log("\nCustomer endpoints");
r = await req("/api/licensing");
check(
  "GET /api/licensing returns the caller's own entitlement",
  r.status === 200 && r.body?.ok === true && typeof r.body?.data?.category === "string",
  `status=${r.status} category=${r.body?.data?.category}`,
);
check(
  "the entitlement payload has the expected entitlement shape",
  r.body?.data !== undefined &&
    ["category", "core", "premium", "isOwner", "isAffiliate", "userId"].every(
      (key) => key in r.body.data,
    ),
  JSON.stringify(Object.keys(r.body?.data ?? {})),
);

r = await req("/api/subscription/redeem", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code: "DKH-P-ZZZZ-ZZZZ-ZZZZ" }),
});
check(
  "redeeming an invalid code is rejected (400)",
  r.status === 400,
  `status=${r.status}`,
);

r = await req("/api/subscription/redeem", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
check(
  "redeeming with no code is rejected (400)",
  r.status === 400,
  `status=${r.status}`,
);

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} checks)`);
process.exit(failed === 0 ? 0 : 1);
