/**
 * Production cleanup: removes automated test accounts and repairs the schema
 * drift left by the hand-rolled production SQL.
 *
 * Default is a DRY RUN that only reads. Pass --apply to execute.
 *
 * Data steps (single transaction):
 *   1. delete every user whose email domain is a known test domain
 *   2. delete orphan Setting / UserSubscription / RedeemCodeRedemption rows
 *   3. null dangling SmartEntrySession resolution hints
 *   4. recompute RedeemCode.redemptionCount from real redemption rows
 *
 * Schema steps (idempotent DDL, after the data commit):
 *   5. add the missing unique index + canonical indexes
 *   6. add the six missing foreign keys that Prisma expects
 *
 * Usage:
 *   npx tsx scripts/db-cleanup.ts            # dry run
 *   npx tsx scripts/db-cleanup.ts --apply    # execute
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
const exec = (sql: string) => prisma.$executeRawUnsafe(sql);
const one = async <T = Record<string, unknown>>(sql: string) => (await q<T>(sql))[0];
const section = (t: string) => console.log(`\n=== ${t} ===`);

const APPLY = process.argv.includes("--apply");
const KEEP_DOMAINS = ["gmail.com"];
const TEST_DOMAINS = ["example.com", "e.com", "test.com", "internal.local"];

const TEST_DOMAIN_SQL = TEST_DOMAINS.map((d) => `'${d}'`).join(", ");
const KEEP_DOMAIN_SQL = KEEP_DOMAINS.map((d) => `'${d}'`).join(", ");

function errText(e: unknown): string {
  return e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : String(e);
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.log(`ABORT: ${message}`);
    process.exit(1);
  }
}

(async () => {
  section(`PREFLIGHT${APPLY ? "" : " (dry run - no writes)"}`);

  const users = await q<{ domain: string; n: string }>(
    `select lower(split_part(email,'@',2)) as domain, count(*)::text as n
       from "User" group by 1 order by count(*) desc`,
  );
  for (const r of users) console.log(`  ${r.domain}: ${r.n} users`);

  const unknown = users.filter((r) => !KEEP_DOMAINS.includes(r.domain) && !TEST_DOMAINS.includes(r.domain));
  assert(
    unknown.length === 0,
    `unknown email domain(s) found: ${unknown.map((r) => `${r.domain} (${r.n})`).join(", ")} - refusing to guess whether they are real`,
  );

  const keep = await q<{ id: string; email: string; name: string; owner: boolean; customers: string; sales: string }>(
    `select u.id, u.email, left(u.name,24) as name,
            exists(select 1 from "UserSubscription" s where s."userId"=u.id and s."ownerGrantedAt" is not null and s."ownerRevokedAt" is null) as owner,
            (select count(*) from "Customer" c where c."userId"=u.id)::text as customers,
            (select count(*) from "Sale" s where s."userId"=u.id)::text as sales
       from "User" u
      where lower(split_part(u.email,'@',2)) in (${KEEP_DOMAIN_SQL})
      order by u."createdAt"`,
  );
  console.log(`\n  KEEPING (${keep.length}):`);
  for (const r of keep) console.log(`    ${r.owner ? "OWNER " : "      "}${r.email} "${r.name}" ${r.customers}c ${r.sales}s`);

  const doomed = await one<{ n: string; with_sales: string; owners: string }>(
    `select count(*)::text as n,
            count(*) filter (where exists(select 1 from "Sale" s where s."userId"=u.id))::text as with_sales,
            count(*) filter (where exists(select 1 from "UserSubscription" s where s."userId"=u.id and (s."ownerGrantedAt" is not null and s."ownerRevokedAt" is null)))::text as owners
       from "User" u
      where lower(split_part(u.email,'@',2)) in (${TEST_DOMAIN_SQL})`,
  );
  console.log(`\n  DELETING (${doomed?.n}): ${doomed?.with_sales} of them have sales`);
  assert(keep.length >= 3, "fewer than 3 Gmail accounts found - refusing");
  assert(Number(doomed?.owners ?? "0") === 0, "a test-domain account holds an owner grant - refusing");

  const doomedSample = await q<{ email: string; name: string }>(
    `select email, left(name,24) as name from "User"
      where lower(split_part(email,'@',2)) in (${TEST_DOMAIN_SQL})
      order by "createdAt" limit 8`,
  );
  for (const r of doomedSample) console.log(`    e.g. ${r.email} "${r.name}"`);
  if (Number(doomed?.n ?? "0") > doomedSample.length) console.log(`    ... and ${Number(doomed?.n) - doomedSample.length} more`);

  section("ORPHANS TO REMOVE");
  const orphans = {
    setting: await one<{ n: string }>(`select count(*)::text as n from "Setting" s where not exists (select 1 from "User" u where u.id=s."userId")`),
    sub: await one<{ n: string }>(`select count(*)::text as n from "UserSubscription" s where not exists (select 1 from "User" u where u.id=s."userId")`),
    redemptionUser: await one<{ n: string }>(`select count(*)::text as n from "RedeemCodeRedemption" r where not exists (select 1 from "User" u where u.id=r."userId")`),
    redemptionCode: await one<{ n: string }>(`select count(*)::text as n from "RedeemCodeRedemption" r where not exists (select 1 from "RedeemCode" c where c.id=r."redeemCodeId")`),
  };
  console.log(`  Setting rows for missing users: ${orphans.setting?.n}`);
  console.log(`  UserSubscription rows for missing users: ${orphans.sub?.n}`);
  console.log(`  RedeemCodeRedemption rows for missing users: ${orphans.redemptionUser?.n}`);
  console.log(`  RedeemCodeRedemption rows for missing codes: ${orphans.redemptionCode?.n}`);

  const danglingHints = await one<{ customers: string; products: string }>(
    `select
       (select count(*) from "SmartEntrySession" s where s."resolvedCustomerId" is not null and not exists (select 1 from "Customer" c where c.id=s."resolvedCustomerId"))::text as customers,
       (select count(*) from "SmartEntrySession" s where s."resolvedProductId" is not null and not exists (select 1 from "Product" p where p.id=s."resolvedProductId"))::text as products`,
  );
  console.log(`  SmartEntrySession dangling customer hints: ${danglingHints?.customers}`);
  console.log(`  SmartEntrySession dangling product hints: ${danglingHints?.products}`);

  const countDrift = await one<{ n: string }>(
    `select count(*)::text as n from "RedeemCode" rc
      where rc."redemptionCount" <> (select count(*) from "RedeemCodeRedemption" r where r."redeemCodeId"=rc.id)`,
  );
  console.log(`  RedeemCode rows whose redemptionCount is wrong: ${countDrift?.n}`);

  if (!APPLY) {
    section("SCHEMA STEPS THAT WOULD RUN");
    console.log("  CREATE UNIQUE INDEX IF NOT EXISTS Setting_userId_key");
    console.log("  CREATE INDEX IF NOT EXISTS 4x SmartEntrySession canonical indexes");
    console.log("  ADD 6 foreign keys: Setting.userId, UserSubscription.userId,");
    console.log("    RedeemCodeRedemption.userId, RedeemCodeRedemption.redeemCodeId,");
    console.log("    SmartEntrySession.resolvedCustomerId (SET NULL), resolvedProductId (SET NULL)");
    console.log("\nDry run only. Re-run with --apply to execute.");
    await prisma.$disconnect();
    return;
  }

  section("DATA CLEANUP (transaction)");
  const deletedUsers = await prisma.$transaction(
    async (tx) => {
      const tagged = await tx.$queryRawUnsafe<{ id: string }[]>(
        `select id from "User" where lower(split_part(email,'@',2)) in (${TEST_DOMAIN_SQL})`,
      );
      const ids = tagged.map((r) => r.id);
      if (ids.length === 0) return 0;

      const removed = await tx.$executeRawUnsafe(
        `delete from "User" where id = any($1::text[])`,
        ids,
      );

      await tx.$executeRawUnsafe(
        `delete from "Setting" s where not exists (select 1 from "User" u where u.id=s."userId")`,
      );
      await tx.$executeRawUnsafe(
        `delete from "UserSubscription" s where not exists (select 1 from "User" u where u.id=s."userId")`,
      );
      await tx.$executeRawUnsafe(
        `delete from "RedeemCodeRedemption" r
          where not exists (select 1 from "User" u where u.id=r."userId")
             or not exists (select 1 from "RedeemCode" c where c.id=r."redeemCodeId")`,
      );
      await tx.$executeRawUnsafe(
        `update "SmartEntrySession" s set "resolvedCustomerId"=null
          where s."resolvedCustomerId" is not null
            and not exists (select 1 from "Customer" c where c.id=s."resolvedCustomerId")`,
      );
      await tx.$executeRawUnsafe(
        `update "SmartEntrySession" s set "resolvedProductId"=null
          where s."resolvedProductId" is not null
            and not exists (select 1 from "Product" p where p.id=s."resolvedProductId")`,
      );
      await tx.$executeRawUnsafe(
        `update "RedeemCode" rc
            set "redemptionCount" = (select count(*) from "RedeemCodeRedemption" r where r."redeemCodeId"=rc.id),
                "updatedAt" = now()
          where rc."redemptionCount" <> (select count(*) from "RedeemCodeRedemption" r where r."redeemCodeId"=rc.id)`,
      );
      return Number(removed);
    },
    { timeout: 120_000 },
  );
  console.log(`  deleted users: ${deletedUsers}`);

  section("SCHEMA REPAIR (idempotent)");
  const ddl: Array<[string, string]> = [
    ["Setting_userId_key", `create unique index if not exists "Setting_userId_key" on "Setting"("userId")`],
    ["SmartEntrySession_userId_createdAt_idx", `create index if not exists "SmartEntrySession_userId_createdAt_idx" on "SmartEntrySession"("userId", "createdAt")`],
    ["SmartEntrySession_status_expiresAt_idx", `create index if not exists "SmartEntrySession_status_expiresAt_idx" on "SmartEntrySession"("status", "expiresAt")`],
    ["SmartEntrySession_resolvedCustomerId_idx", `create index if not exists "SmartEntrySession_resolvedCustomerId_idx" on "SmartEntrySession"("resolvedCustomerId")`],
    ["SmartEntrySession_resolvedProductId_idx", `create index if not exists "SmartEntrySession_resolvedProductId_idx" on "SmartEntrySession"("resolvedProductId")`],
  ];
  for (const [name, sql] of ddl) {
    try {
      await exec(sql);
      console.log(`  ok ${name}`);
    } catch (e) {
      console.log(`  FAILED ${name}: ${errText(e).slice(0, 160)}`);
    }
  }

  const fks: Array<[string, string, string]> = [
    ["Setting_userId_fkey", "Setting", `alter table "Setting" add constraint "Setting_userId_fkey" foreign key ("userId") references "User"("id") on delete cascade on update cascade`],
    ["UserSubscription_userId_fkey", "UserSubscription", `alter table "UserSubscription" add constraint "UserSubscription_userId_fkey" foreign key ("userId") references "User"("id") on delete cascade on update cascade`],
    ["RedeemCodeRedemption_userId_fkey", "RedeemCodeRedemption", `alter table "RedeemCodeRedemption" add constraint "RedeemCodeRedemption_userId_fkey" foreign key ("userId") references "User"("id") on delete cascade on update cascade`],
    ["RedeemCodeRedemption_redeemCodeId_fkey", "RedeemCodeRedemption", `alter table "RedeemCodeRedemption" add constraint "RedeemCodeRedemption_redeemCodeId_fkey" foreign key ("redeemCodeId") references "RedeemCode"("id") on delete cascade on update cascade`],
    ["SmartEntrySession_resolvedCustomerId_fkey", "SmartEntrySession", `alter table "SmartEntrySession" add constraint "SmartEntrySession_resolvedCustomerId_fkey" foreign key ("resolvedCustomerId") references "Customer"("id") on delete set null on update cascade`],
    ["SmartEntrySession_resolvedProductId_fkey", "SmartEntrySession", `alter table "SmartEntrySession" add constraint "SmartEntrySession_resolvedProductId_fkey" foreign key ("resolvedProductId") references "Product"("id") on delete set null on update cascade`],
  ];
  for (const [name, table, sql] of fks) {
    const exists = await q<{ n: string }>(
      `select count(*)::text as n from pg_constraint where conname='${name}'`,
    );
    if (exists[0]?.n !== "0") {
      console.log(`  ok ${name} (already present)`);
      continue;
    }
    try {
      await exec(sql);
      console.log(`  ok ${name} on ${table}`);
    } catch (e) {
      console.log(`  FAILED ${name}: ${errText(e).slice(0, 200)}`);
    }
  }

  await prisma.$disconnect();
  console.log("\nCleanup finished.");
})().catch(async (e) => {
  console.log("FAILED:", (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/[^ ]+/gi, "postgresql://***").slice(0, 500));
  await prisma.$disconnect();
  process.exit(1);
});

