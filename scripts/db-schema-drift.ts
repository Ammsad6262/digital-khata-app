/**
 * Read-only drift check: compares the live database's constraints and indexes
 * against the Prisma baseline migration (the schema Prisma expects).
 *
 * Usage: npx tsx scripts/db-schema-drift.ts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
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
}
loadEnv();

const prisma = new PrismaClient({ log: [] });
const q = <T = Record<string, unknown>>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);

async function main() {
  const baselinePath = path.resolve(
    process.cwd(),
    "prisma/migrations/20260101000000_baseline/migration.sql",
  );
  const baseline = readFileSync(baselinePath, "utf8");

  const wantedConstraints = [...baseline.matchAll(/ADD CONSTRAINT "([^"]+)"/g)]
    .map((m) => m[1])
    .filter((n): n is string => typeof n === "string");
  const wantedIndexes = [...baseline.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)]
    .map((m) => m[1])
    .filter((n): n is string => typeof n === "string");

  const dbConstraints = await q<{ conname: string }>(
    `select conname from pg_constraint c join pg_namespace n on n.oid=c.connamespace
      where n.nspname='public'`,
  );
  const dbIndexes = await q<{ indexname: string }>(
    `select indexname from pg_indexes where schemaname='public'`,
  );
  const haveC = new Set(dbConstraints.map((r) => r.conname));
  const haveI = new Set(dbIndexes.map((r) => r.indexname));

  const missingC = wantedConstraints.filter((n) => !haveC.has(n));
  const missingI = wantedIndexes.filter((n) => !haveI.has(n));

  console.log(`baseline constraints: ${wantedConstraints.length}, live: ${dbConstraints.length}`);
  console.log(`baseline indexes: ${wantedIndexes.length}, live: ${dbIndexes.length}`);
  console.log(`\nMISSING CONSTRAINTS (${missingC.length}):`);
  for (const n of missingC) console.log(`  ${n}`);
  console.log(`\nMISSING INDEXES (${missingI.length}):`);
  for (const n of missingI) console.log(`  ${n}`);

  const extraC = [...haveC].filter((n) => !wantedConstraints.includes(n) && !n.endsWith("_pkey") && !n.startsWith("sql_features"));
  console.log(`\nCONSTRAINTS IN LIVE BUT NOT BASELINE (${extraC.length}):`);
  for (const n of extraC) console.log(`  ${n}`);

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.log("FAILED:", (e instanceof Error ? e.message : String(e)).slice(0, 300));
  await prisma.$disconnect();
  process.exit(1);
});
