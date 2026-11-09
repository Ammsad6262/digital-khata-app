/**
 * Commercial licensing — row-level security (RLS) isolation tests.
 *
 * Proves that the restricted application role (`khata_app`, or the value of
 * `LICENSING_RLS_ROLE`) can only see and mutate rows belonging to the
 * transaction-local `app.user_id`, and that an unset context matches nothing
 * (fail-closed). The owner connection still bypasses RLS for admin work.
 *
 * Safety: refuses to run unless DATABASE_URL points at `khata_licensing`.
 * Run: npm run test:licensing-rls   (after `npx prisma migrate deploy`)
 */

import { Prisma, PrismaClient } from "@prisma/client";

const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL.includes("khata_licensing")) {
  console.error(
    "REFUSING TO RUN: DATABASE_URL is not the isolated khata_licensing database.",
  );
  process.exit(1);
}

const ROLE = (process.env.LICENSING_RLS_ROLE ?? "khata_app").trim();
const ROLE_RE = /^[a-z_][a-z0-9_]*$/i;
if (!ROLE_RE.test(ROLE)) {
  console.error(`Invalid LICENSING_RLS_ROLE: ${ROLE}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const RUN = `licensing-rls-${Date.now()}`;
const DOMAIN = "@licensing-rls.test";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Run a query inside a transaction as the restricted role + user context. */
async function asRestricted<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE "${ROLE}"`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO public`);
    await tx.$queryRawUnsafe(`SELECT set_config('app.user_id', $1, true)`, userId);
    return fn(tx);
  });
}

async function main() {
  const role = await prisma.$queryRawUnsafe<{ rolname: string }[]>(
    `SELECT rolname FROM pg_roles WHERE rolname = $1`,
    ROLE,
  );
  if (role.length === 0) {
    console.error(
      `ROLE '${ROLE}' does not exist. Run \`npx prisma migrate deploy\` first.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });

  const a = await prisma.user.create({
    data: { name: "RLS A", email: `${RUN}-a${DOMAIN}`, passwordHash: "x" },
  });
  const b = await prisma.user.create({
    data: { name: "RLS B", email: `${RUN}-b${DOMAIN}`, passwordHash: "x" },
  });

  const now = new Date();
  for (const u of [a, b]) {
    await prisma.userSubscription.create({
      data: {
        userId: u.id,
        status: "TRIAL_ACTIVE",
        trialStartedAt: now,
        trialExpiresAt: now,
        coreActivatedAt: now,
        coreExpiresAt: null,
      },
    });
  }
  const code = await prisma.redeemCode.create({
    data: { codeHash: `${RUN}-hash`, kind: "PREMIUM", durationDays: 30 },
  });
  for (const u of [a, b]) {
    await prisma.redeemCodeRedemption.create({
      data: {
        redeemCodeId: code.id,
        userId: u.id,
        kind: "PREMIUM",
        durationDays: 30,
        newAccessExpiresAt: now,
      },
    });
  }

  console.log(`\nRLS isolation via role '${ROLE}'`);

  const aSubs = await asRestricted(a.id, (tx) =>
    tx.$queryRawUnsafe<{ userId: string }[]>(
      `SELECT "userId" FROM "UserSubscription"`,
    ),
  );
  check(
    "restricted role sees exactly one subscription",
    aSubs.length === 1,
    `rows=${aSubs.length}`,
  );
  check(
    "restricted role sees only its own subscription",
    aSubs[0]?.userId === a.id,
    `got=${aSubs[0]?.userId}`,
  );

  const denied = await asRestricted(a.id, (tx) =>
    tx.$executeRawUnsafe(
      `UPDATE "UserSubscription" SET "coreExpiresAt" = NOW() WHERE "userId" = $1`,
      b.id,
    ),
  );
  check(
    "restricted role cannot update another user's subscription",
    denied === 0,
    `updated=${denied}`,
  );

  const noCtx = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE "${ROLE}"`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO public`);
    await tx.$queryRawUnsafe(`SELECT set_config('app.user_id', '', true)`);
    return tx.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM "UserSubscription"`);
  });
  check(
    "restricted role with empty context sees no rows",
    noCtx.length === 0,
    `rows=${noCtx.length}`,
  );

  const aRed = await asRestricted(a.id, (tx) =>
    tx.$queryRawUnsafe<{ userId: string }[]>(
      `SELECT "userId" FROM "RedeemCodeRedemption"`,
    ),
  );
  check(
    "restricted role sees only its own redemptions",
    aRed.length === 1 && aRed[0]?.userId === a.id,
    `rows=${aRed.length}`,
  );

  const ownerRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM "UserSubscription" WHERE "userId" IN ($1, $2)`,
    a.id,
    b.id,
  );
  check(
    "owner connection sees all rows (admin bypass)",
    Number(ownerRows[0]?.n ?? 0) === 2,
    `rows=${ownerRows[0]?.n}`,
  );

  await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await prisma.redeemCode.deleteMany({ where: { codeHash: `${RUN}-hash` } });

  console.log(`\n${passed} passed, ${failed} failed (${passed + failed} checks)`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
