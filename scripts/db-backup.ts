/**
 * Full logical snapshot of the database, before any destructive change.
 *
 * Uses only SELECTs. Writes one JSON file containing every table's rows plus
 * the schema pieces needed to rebuild confidence (indexes, constraints, FKs).
 *
 * Usage: npx tsx scripts/db-backup.ts
 * Output: directory from DB_BACKUP_DIR, else the OS temp dir opencode folder.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
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

(async () => {
  const startedAt = new Date().toISOString();
  const outDir =
    process.env.DB_BACKUP_DIR ||
    path.join(os.tmpdir(), "opencode");
  mkdirSync(outDir, { recursive: true });

  const tables = await q<{ relname: string }>(
    `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`,
  );

  const data: Record<string, unknown[]> = {};
  let totalRows = 0;
  for (const { relname } of tables) {
    const raw = await q<{ json: string }>(
      `select coalesce(json_agg(t), '[]'::json)::text as json from "${relname}" t`,
    );
    const rows = JSON.parse(raw[0]?.json ?? "[]") as unknown[];
    data[relname] = rows;
    totalRows += rows.length;
    console.log(`  ${relname}: ${rows.length}`);
  }

  const indexes = await q<{ tablename: string; indexname: string; indexdef: string }>(
    `select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by tablename, indexname`,
  );
  const constraints = await q<{ table_name: string; constraint_name: string; definition: string }>(
    `select c.conrelid::regclass::text as table_name,
            c.conname as constraint_name,
            pg_get_constraintdef(c.oid) as definition
       from pg_constraint c
       join pg_namespace n on n.oid=c.connamespace
      where n.nspname='public'
      order by 1, 2`,
  );

  const payload = {
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      database: (await q<{ db: string }>(`select current_database() as db`))[0]?.db,
      serverVersion: (await q<{ v: string }>(`select version() as v`))[0]?.v,
      totalRows,
      tables: tables.map((t) => t.relname),
    },
    indexes,
    constraints,
    data,
  };

  const json = JSON.stringify(payload, null, 2);
  const stamp = startedAt.replace(/[:.]/g, "-");
  const file = path.join(outDir, `db-backup-${stamp}.json`);
  writeFileSync(file, json, "utf8");
  const sha = createHash("sha256").update(json).digest("hex");

  console.log(`\nBackup written: ${file}`);
  console.log(`Rows: ${totalRows}`);
  console.log(`Size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`SHA256: ${sha}`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.log("BACKUP FAILED:", (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/[^ ]+/gi, "postgresql://***").slice(0, 400));
  await prisma.$disconnect();
  process.exit(1);
});
