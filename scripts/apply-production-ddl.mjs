#!/usr/bin/env node
/**
 * Applies the additive, idempotent production DDL deltas required by the
 * current release, then exits.
 *
 * Runs ONLY on Vercel (guarded by VERCEL=1) so a local `npm run build` never
 * touches a database.
 *
 * Why this exists: the current code reads `"Transaction"."voidedAt"` and the
 * assistant tables (AIUsageDaily / AssistantAction / AssistantThread). Those
 * objects do not exist on a database that was provisioned before this release.
 * Running the deltas here means a deploy can never ship code that expects a
 * schema the database does not have: if the SQL fails the build fails, and
 * Vercel keeps serving the previous (working) deployment.
 *
 * Every file below is additive and idempotent (IF NOT EXISTS + guarded foreign
 * keys), so re-running it on every deploy is safe.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRISMA_CLI = path.join(ROOT, "node_modules", "prisma", "build", "index.js");

// Ordered list of the deltas the current release requires.
const FILES = [
  "prisma/production/20261102_ai_assistant_tables.sql",
  "prisma/production/20261102_transaction_voided_at.sql",
];

const log = (msg) => console.log(`[ddl] ${msg}`);

if (!process.env.VERCEL) {
  log("not running on Vercel — skipping production DDL");
  process.exit(0);
}

// Escape hatch: set SKIP_PRODUCTION_DDL=1 in Vercel to unblock a deploy when
// the schema is already up to date (the deltas below are idempotent).
if (process.env.SKIP_PRODUCTION_DDL === "1") {
  log("SKIP_PRODUCTION_DDL=1 — skipping production DDL");
  process.exit(0);
}

// A hung database connection must never occupy Vercel's build slot: cap each
// prisma invocation, then abort so the previous deployment stays live.
const DDL_TIMEOUT_MS = Number(process.env.DDL_TIMEOUT_MS || 60000);

/**
 * Supabase exposes two pooler ports:
 *   6543 — transaction mode, used by the app at runtime
 *   5432 — session mode, required for DDL (ALTER / CREATE / BEGIN…COMMIT)
 *
 * Vercel projects often define only DATABASE_URL. Sending DDL through the
 * transaction pooler gets rejected and aborts the build. When DIRECT_URL is
 * absent, derive the session-mode URL from the pooled one rather than reusing
 * the transaction pooler. Both ports share the same host and credentials.
 */
function deriveSessionUrl(pooledUrl) {
  try {
    const u = new URL(pooledUrl);
    if (u.port === "6543") u.port = "5432";
    // Prisma's migration engine rejects ?pgbouncer=true; session mode does not
    // need the prepared-statement shim.
    u.searchParams.delete("pgbouncer");
    return u.toString();
  } catch {
    return null;
  }
}

const databaseUrl = process.env.DATABASE_URL;
const derivedUrl = databaseUrl ? deriveSessionUrl(databaseUrl) : null;
const url = process.env.DIRECT_URL || derivedUrl || databaseUrl;

if (!url) {
  console.error("[ddl] neither DIRECT_URL nor DATABASE_URL is set");
  process.exit(1);
}
if (!process.env.DIRECT_URL) {
  if (derivedUrl && derivedUrl !== databaseUrl) {
    log("DIRECT_URL not set — derived a session-mode URL from DATABASE_URL for DDL");
  } else {
    log("WARNING: DIRECT_URL is not set — using DATABASE_URL for DDL");
  }
}

// Log the target host/port only — never the credentials.
try {
  const target = new URL(url);
  log(`DDL target: ${target.hostname}:${target.port || "5432"}${target.pathname}`);
} catch {
  // non-URL connection strings are passed through to Prisma untouched
}
if (!existsSync(PRISMA_CLI)) {
  console.error(`[ddl] Prisma CLI not found at ${PRISMA_CLI}`);
  process.exit(1);
}

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) {
    console.error(`[ddl] missing file: ${rel}`);
    process.exit(1);
  }

  let applied = false;
  let reason = "unknown error";
  for (let attempt = 1; attempt <= 3 && !applied; attempt++) {
    const res = spawnSync(
      process.execPath,
      [PRISMA_CLI, "db", "execute", "--file", file, "--url", url],
      { stdio: "inherit", timeout: DDL_TIMEOUT_MS, killSignal: "SIGTERM" },
    );
    applied = res.status === 0;
    if (!applied) {
      if (res.error?.code === "ETIMEDOUT") reason = `timed out after ${DDL_TIMEOUT_MS}ms`;
      else if (res.signal) reason = `killed by ${res.signal}`;
      else reason = `exit code ${res.status}`;
      if (attempt < 3) log(`attempt ${attempt} failed for ${rel} (${reason}) — retrying`);
    }
  }

  if (!applied) {
    console.error(
      `[ddl] could not apply ${rel} (${reason}); aborting the build so the previous deployment stays live. ` +
        `If the schema is already up to date, set SKIP_PRODUCTION_DDL=1 in Vercel.`,
    );
    process.exit(1);
  }
  log(`applied ${rel}`);
}

log("production DDL is up to date");
