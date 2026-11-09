/**
 * Static security gate — runnable without a database.
 *
 * Encodes the invariants this audit fixed, so they cannot silently regress:
 * patched framework, no SQL string-building, auth rate limits, no internal
 * error leakage, security headers, password strength, and no committed secrets.
 *
 * Usage: node scripts/audit-security-static.mjs
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

let pass = 0;
let fail = 0;
const a = (cond, label) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
};
const read = (p) => readFileSync(p, "utf8");
const readIf = (p) => (existsSync(p) ? read(p) : "");

console.log("=== STATIC SECURITY GATE ===\n");

// 1. Framework patched (known RCE/cache/SSRF advisories < 16.4.1).
const nextPkg = JSON.parse(readIf("node_modules/next/package.json") || "{}");
const v = (nextPkg.version || "0.0.0").split(".").map(Number);
const nextOk = v[0] > 16 || (v[0] === 16 && (v[1] > 4 || (v[1] === 4 && v[2] >= 1)));
a(nextOk, `Next.js is patched (${nextPkg.version || "not installed"} >= 16.4.1)`);

// 2. No SQL built from strings (injection sink).
const prisma = read("src/lib/db/prisma.ts");
a(!/\$executeRawUnsafe\(\s*`\s*SET/.test(prisma), "No string-interpolated SET app.user_id");
a(!/replace\(\/'\/g/.test(prisma), "No manual quote-escaping of SQL values");

// 3. Brute-force protection on credential endpoints.
a(/checkRateLimit/.test(read("src/app/api/auth/login/route.ts")), "Login is rate limited");
a(/checkRateLimit/.test(read("src/app/api/auth/register/route.ts")), "Register is rate limited");
a(/checkRateLimit/.test(read("src/app/api/auth/unlock/route.ts")), "PIN unlock is rate limited");
a(/checkRateLimit/.test(read("src/app/api/settings/pin/route.ts")), "PIN change is rate limited");
a(/checkRateLimit/.test(read("src/app/api/settings/clear-all/route.ts")), "clear-all is rate limited");

// 4. Login timing cannot enumerate accounts (dummy bcrypt compare).
a(/DUMMY_HASH/.test(read("src/lib/services/auth.ts")), "Login does a dummy hash compare when account is unknown");

// 5. No internal error detail on the public status endpoint.
a(
  !/api\.auth\.status\.databaseError[^\n]*\{\s*message\s*\}/.test(read("src/app/api/auth/status/route.ts")),
  "auth/status does not echo DB errors",
);

// 6. Security headers.
const cfg = readIf("next.config.mjs");
for (const h of [
  "Content-Security-Policy",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Strict-Transport-Security",
  "Permissions-Policy",
]) {
  a(cfg.includes(h), `Header configured: ${h}`);
}

// 7. Password strength.
a(/password\.length < 8/.test(read("src/lib/services/auth.ts")), "Password minimum is 8 characters");
a(/min\(8, "api\.password\.tooShort"\)/.test(read("src/app/api/auth/reset-password/route.ts")), "Reset password minimum is 8");

// 8. Client IP cannot be spoofed for rate limiting.
const rl = read("src/lib/auth/rate-limiter.ts");
a(/x-real-ip/.test(rl) && rl.indexOf("x-real-ip") < rl.indexOf("x-forwarded-for"), "Rate limiter prefers x-real-ip over spoofable x-forwarded-for");

// 9. No committed env file with real secrets.
let trackedEnv = "";
try {
  trackedEnv = execSync("git ls-files .env .env.local .env.production", { encoding: "utf8" }).trim();
} catch {}
a(!trackedEnv, "No real .env file is tracked by git");

// 10. No obvious secrets in source.
const secretPatterns = [
  [/sk-[A-Za-z0-9]{20,}/, "OpenAI-style key"],
  [/ghp_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/AIza[0-9A-Za-z_-]{20,}/, "Google API key"],
  [/postgres(ql)?:\/\/[^\s"']+:[^\s"'@]+@/, "Postgres URL with password"],
];
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(p)) files.push(p);
  }
})("src");
let leaked = [];
for (const f of files) {
  const src = read(f);
  for (const [re, name] of secretPatterns) if (re.test(src)) leaked.push(`${name} in ${f}`);
}
a(leaked.length === 0, `No hardcoded secrets in source${leaked.length ? `: ${leaked.join("; ")}` : ""}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);