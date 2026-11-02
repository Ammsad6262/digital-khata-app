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

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("[ddl] neither DIRECT_URL nor DATABASE_URL is set");
  process.exit(1);
}
if (!process.env.DIRECT_URL) {
  log("WARNING: DIRECT_URL is not set — falling back to DATABASE_URL (the pooler may reject DDL)");
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
  for (let attempt = 1; attempt <= 3 && !applied; attempt++) {
    const res = spawnSync(
      process.execPath,
      [PRISMA_CLI, "db", "execute", "--file", file, "--url", url],
      { stdio: "inherit" },
    );
    applied = res.status === 0;
    if (!applied && attempt < 3) log(`attempt ${attempt} failed for ${rel} — retrying`);
  }

  if (!applied) {
    console.error(`[ddl] could not apply ${rel}; aborting the build so the previous deployment stays live`);
    process.exit(1);
  }
  log(`applied ${rel}`);
}

log("production DDL is up to date");
