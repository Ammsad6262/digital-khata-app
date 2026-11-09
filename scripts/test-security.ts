/**
 * Security regression tests (pure functions, no database).
 *
 * Locks in the behaviour this audit relied on:
 *   - the rate limiter locks after 5 failures and resets on success
 *   - the client IP cannot be spoofed via x-forwarded-for
 *
 * Usage: npm run test:security
 */

import {
  checkRateLimit,
  recordFailure,
  recordSuccess,
  getClientIp,
} from "../src/lib/auth/rate-limiter";

let pass = 0;
let fail = 0;
function a(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}`);
  }
}

// ── Rate limiter ────────────────────────────────────────────────────────────
const ip = `test-${Date.now()}`;
a(!checkRateLimit(ip).locked, "fresh IP is not locked");

for (let i = 0; i < 4; i++) recordFailure(ip);
a(!checkRateLimit(ip).locked, "4 failures do not lock");

recordFailure(ip);
const locked = checkRateLimit(ip);
a(locked.locked, "5th failure locks the IP");
a(locked.retryAfter > 0, "lockout reports a positive retry-after");

recordSuccess(ip);
a(!checkRateLimit(ip).locked, "a successful attempt clears the lockout");

// ── Client IP extraction ────────────────────────────────────────────────────
const spoofed = new Request("http://x", {
  headers: {
    "x-real-ip": "1.1.1.1",
    "x-forwarded-for": "9.9.9.9, 2.2.2.2",
  },
});
a(getClientIp(spoofed) === "1.1.1.1", "x-real-ip wins over spoofable x-forwarded-for");

const forwardedOnly = new Request("http://x", {
  headers: { "x-forwarded-for": "9.9.9.9, 2.2.2.2" },
});
a(getClientIp(forwardedOnly) === "2.2.2.2", "x-forwarded-for falls back to the trusted right-most entry");

const none = new Request("http://x");
a(getClientIp(none) === "unknown", "missing IP headers fall back to 'unknown'");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);