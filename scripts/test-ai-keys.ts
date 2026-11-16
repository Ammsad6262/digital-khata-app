/**
 * AI key-pool tests (pure — no database, no provider calls).
 *
 * Two keys, one model chain:
 *   - customers/trials spend GEMINI_API_KEY
 *   - owners/affiliates spend GEMINI_OWNER_API_KEY
 *
 * These tests lock in the routing rule, the safe fallback when the owner key is
 * missing, the per-pool usage counters, and a source guard that fails if any
 * module starts reading a Gemini key directly instead of going through the pool.
 *
 * Usage: npx tsx scripts/test-ai-keys.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  aiKeyStatus,
  apiKeyForPool,
  currentAiKeyPool,
  poolForCategory,
  setAiKeyPool,
  usageKeyFor,
} from "../src/lib/ai/key-pool";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, label: string, detail?: string) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
  }
};

// ── Entitlement → key pool ───────────────────────────────────────────────────

ok(poolForCategory("OWNER") === "owner", "OWNER spends the owner key");
ok(poolForCategory("AFFILIATE") === "owner", "AFFILIATE spends the owner key");
ok(poolForCategory("PREMIUM") === "user", "PREMIUM spends the customer key");
ok(poolForCategory("TRIAL") === "user", "TRIAL spends the customer key");
ok(poolForCategory("REGULAR") === "user", "REGULAR maps to the customer key (and is blocked before any call)");
ok(poolForCategory("UNACTIVATED") === "user", "UNACTIVATED maps to the customer key (and is blocked before any call)");

// ── Usage counters must not mix between pools ────────────────────────────────

const userModelKey = usageKeyFor("user", "gemini-3.5-flash");
const ownerModelKey = usageKeyFor("owner", "gemini-3.5-flash");
ok(userModelKey !== ownerModelKey, "usage rows are namespaced per pool");
ok(userModelKey.startsWith("user::"), "customer usage key is prefixed", userModelKey);
ok(ownerModelKey.startsWith("owner::"), "owner usage key is prefixed", ownerModelKey);
ok(usageKeyFor("user", "a") === usageKeyFor("user", "a"), "usage key is deterministic");

// ── Key resolution and the safe fallback ─────────────────────────────────────

const savedUser = process.env.GEMINI_API_KEY;
const savedOwner = process.env.GEMINI_OWNER_API_KEY;
const restore = () => {
  if (savedUser === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedUser;
  if (savedOwner === undefined) delete process.env.GEMINI_OWNER_API_KEY;
  else process.env.GEMINI_OWNER_API_KEY = savedOwner;
};

process.env.GEMINI_API_KEY = "customer-key";
process.env.GEMINI_OWNER_API_KEY = "owner-key";
ok(apiKeyForPool("user") === "customer-key", "customer pool uses GEMINI_API_KEY");
ok(apiKeyForPool("owner") === "owner-key", "owner pool uses GEMINI_OWNER_API_KEY");
ok(aiKeyStatus().user && aiKeyStatus().owner && aiKeyStatus().ownerDedicated, "status reports both keys configured");

delete process.env.GEMINI_OWNER_API_KEY;
ok(apiKeyForPool("owner") === "customer-key", "owner pool falls back to the customer key when the owner key is missing");
ok(aiKeyStatus().ownerDedicated === false, "status reports the owner key as not dedicated");

process.env.GEMINI_OWNER_API_KEY = "owner-key";
delete process.env.GEMINI_API_KEY;
ok(apiKeyForPool("user") === undefined, "customer pool has no key when GEMINI_API_KEY is missing");
ok(apiKeyForPool("owner") === "owner-key", "owner pool still resolves its own key without the customer key");

restore();

// ── Request-scoped pool (AsyncLocalStorage) ──────────────────────────────────

const before = currentAiKeyPool();
ok(before === "user" || before === "owner", "current pool is always a valid pool", before);
const registry = globalThis as typeof globalThis & { __dkAiKeyPoolStorage?: unknown };
ok(
  registry.__dkAiKeyPoolStorage !== undefined,
  "pool storage is pinned on globalThis (Next.js inlines this module into many chunks)",
);
setAiKeyPool("owner");
ok(currentAiKeyPool() === "owner", "pool binding is visible in the same async context");
setAiKeyPool("user");
ok(currentAiKeyPool() === "user", "pool binding can be changed back");

// ── Source guard: nobody bypasses the pool ───────────────────────────────────

const SRC = path.resolve(process.cwd(), "src");
const ALLOWED = new Set(["src\\lib\\ai\\key-pool.ts", "src/lib/ai/key-pool.ts"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
for (const file of walk(SRC)) {
  const rel = path.relative(process.cwd(), file);
  if (ALLOWED.has(rel)) continue;
  const source = readFileSync(file, "utf8");
  if (/process\.env\.GEMINI_(OWNER_)?API_KEY/.test(source)) offenders.push(rel);
}
ok(
  offenders.length === 0,
  "only key-pool.ts reads Gemini key env vars directly",
  offenders.join(", "),
);

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);