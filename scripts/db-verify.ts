/**
 * Read-only verification of database state. Safe to run before and after cleanup.
 *
 * Prints exact counts (not reltuples estimates), ownership of the few rows that
 * have no FK to User, and the indexes that the app's code depends on.
 *
 * Usage: npx tsx scripts/db-verify.ts
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
const one = async <T = Record<string, unknown>>(sql: string) => (await q<T>(sql))[0];
const section = (t: string) => console.log(`\n=== ${t} ===`);

(async () => {
  section("EXACT TABLE COUNTS");
  const tables = await q<{ relname: string }>(
    `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`,
  );
  for (const t of tables) {
    const r = await one<{ n: string }>(`select count(*)::text as n from "${t.relname}"`);
    console.log(`  ${t.relname}: ${r?.n}`);
  }

  section("USERS BY DOMAIN (exact)");
  const domains = await q<{ domain: string; n: string }>(
    `select coalesce(lower(split_part(email,'@',2)),'(none)') as domain, count(*)::text as n
       from "User" group by 1 order by count(*) desc`,
  );
  for (const r of domains) console.log(`  ${r.domain}: ${r.n}`);

  section("SUBSCRIPTION SANITY");
  const sub = await one<{ total: string; distinct_users: string; no_user: string }>(
    `select count(*)::text as total,
            count(distinct "userId")::text as distinct_users,
            count(*) filter (where not exists (select 1 from "User" u where u.id=s."userId"))::text as no_user
       from "UserSubscription" s`,
  );
  console.log(`  subscriptions=${sub?.total} distinct userId=${sub?.distinct_users} orphan=${sub?.no_user}`);
  const noSub = await one<{ n: string }>(
    `select count(*)::text as n from "User" u
      where not exists (select 1 from "UserSubscription" s where s."userId"=u.id)`,
  );
  console.log(`  users without subscription: ${noSub?.n}`);

  section("OWNERS / AFFILIATES");
  const owners = await q<{ email: string; name: string; kind: string; status: string }>(
    `select u.email, left(u.name,24) as name, s.status,
            case when s."ownerGrantedAt" is not null and s."ownerRevokedAt" is null then 'OWNER'
                 when s."affiliateGrantedAt" is not null and s."affiliateRevokedAt" is null then 'AFFILIATE'
                 else '-' end as kind
       from "UserSubscription" s join "User" u on u.id=s."userId"
      where (s."ownerGrantedAt" is not null and s."ownerRevokedAt" is null)
         or (s."affiliateGrantedAt" is not null and s."affiliateRevokedAt" is null)`,
  );
  for (const r of owners) console.log(`  ${r.kind} ${r.status} ${r.email} ${r.name}`);

  section("REDEEM REDEMPTIONS (owner of each)");
  const reds = await q<{ id: string; code: string | null; kind: string | null; email: string | null; created: string; user_exists: boolean }>(
    `select r.id, rc.label as code, rc.kind,
            u.email,
            to_char(r."redeemedAt",'YYYY-MM-DD HH24:MI') as created,
            (u.id is not null) as user_exists
       from "RedeemCodeRedemption" r
       left join "User" u on u.id=r."userId"
       left join "RedeemCode" rc on rc.id=r."redeemCodeId"
      order by r."redeemedAt"`,
  );
  for (const r of reds) {
    console.log(`  ${r.created} ${r.kind ?? "?"} ${r.code ?? "?"} -> ${r.email ?? "(no user)"} exists=${r.user_exists}`);
  }
  console.log(`  total redemption rows: ${reds.length}`);
  const countDrift = await q<{ label: string; kind: string; redemptionCount: number; rows: string }>(
    `select rc.label, rc.kind, rc."redemptionCount",
            (select count(*)::text from "RedeemCodeRedemption" r where r."redeemCodeId"=rc.id) as rows
       from "RedeemCode" rc
      where rc."redemptionCount" <> (select count(*) from "RedeemCodeRedemption" r where r."redeemCodeId"=rc.id)
      order by rc.label`,
  );
  console.log(`  codes whose redemptionCount disagrees with redemption rows: ${countDrift.length}`);
  for (const r of countDrift) console.log(`    ${r.kind} ${r.label}: count=${r.redemptionCount} rows=${r.rows}`);

  section("TABLES WITH userId BUT NO FK TO User");
  const noFk = await q<{ table_name: string; column_name: string }>(
    `select c.table_name, c.column_name
       from information_schema.columns c
      where c.table_schema='public' and c.column_name='userId'
        and not exists (
          select 1 from pg_constraint k
           where k.contype='f' and k.confrelid='"User"'::regclass
             and k.conrelid = ('public.' || quote_ident(c.table_name))::regclass
        )
      order by 1`,
  );
  for (const r of noFk) console.log(`  ${r.table_name}.${r.column_name}`);

  section("ROWS IN THOSE TABLES POINTING AT A MISSING USER");
  for (const r of noFk) {
    const o = await one<{ n: string }>(
      `select count(*)::text as n from "${r.table_name}" t
        where t."userId" is not null and not exists (select 1 from "User" u where u.id=t."userId")`,
    );
    if (o?.n !== "0") console.log(`  ${r.table_name}: ${o?.n} orphan rows`);
    else console.log(`  ${r.table_name}: 0`);
  }

  section("INDEXES THE APP NEEDS");
  for (const name of ["Setting_userId_key", "UserSubscription_userId_key", "User_email_key", "Customer_userId_phone_key"]) {
    const found = await q<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname='public' and indexname='${name}'`,
    );
    console.log(`  ${name}: ${found.length ? "present" : "MISSING"}`);
  }

  section("DUPLICATES THAT WOULD BLOCK A UNIQUE INDEX");
  for (const [table, col] of [["Setting", "userId"], ["UserSubscription", "userId"], ["User", "email"]] as const) {
    const d = await one<{ n: string }>(
      `select count(*)::text as n from (select "${col}" from "${table}" group by 1 having count(*)>1) t`,
    );
    console.log(`  ${table}(${col}) duplicate values: ${d?.n}`);
  }

  section("MONEY / LEDGER SANITY");
  const money = await one<{
    overpaid: string; bad_outstanding: string; orphan_payments: string;
    null_user_sales: string; negative_balance: string;
  }>(
    `select
       (select count(*) from "Sale" where "paidAmount" > "totalAmount" and "voidedAt" is null)::text as overpaid,
       (select count(*) from "Sale" where abs(("totalAmount" - "paidAmount") - "outstanding") > 0.01 and "voidedAt" is null)::text as bad_outstanding,
       (select count(*) from "Payment" p where not exists (select 1 from "Customer" c where c.id=p."customerId"))::text as orphan_payments,
       (select count(*) from "Sale" where "userId" is null)::text as null_user_sales,
       (select count(*) from (
          select c.id, (c."openingBalance"
            + coalesce((select sum(s."totalAmount") from "Sale" s where s."customerId"=c.id and s."voidedAt" is null),0)
            - coalesce((select sum(p.amount) from "Payment" p where p."customerId"=c.id and p."voidedAt" is null),0)
            + coalesce((select sum(a.amount) from "CustomerAdjustment" a where a."customerId"=c.id and a."voidedAt" is null),0)) as b
          from "Customer" c where c."isDeleted"=false
        ) t where b < 0)::text as negative_balance`,
  );
  console.log(`  sales paid>total: ${money?.overpaid}`);
  console.log(`  sales inconsistent outstanding: ${money?.bad_outstanding}`);
  console.log(`  payments with missing customer: ${money?.orphan_payments}`);
  console.log(`  sales with null userId: ${money?.null_user_sales}`);
  console.log(`  customers with negative balance: ${money?.negative_balance}`);

  await prisma.$disconnect();
  console.log("\nDone (read-only).");
})().catch(async (e) => {
  console.log("FAILED:", (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/[^ ]+/gi, "postgresql://***").slice(0, 400));
  await prisma.$disconnect();
  process.exit(1);
});
