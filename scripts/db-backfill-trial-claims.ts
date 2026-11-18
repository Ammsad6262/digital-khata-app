/**
 * Backfill `TrialClaim` from existing subscriptions.
 *
 * The trial-claim table only starts recording from the moment it ships. Without
 * this, anyone who used a trial *before* that moment could still delete their
 * account and start a fresh one, because no claim row exists for their address.
 *
 * A subscription with `coreExpiresAt` set is one that has run (or is running) a
 * free trial — a redeemed PRODUCT code clears it to NULL, i.e. a paying
 * customer. Paying customers are deliberately not backfilled: if one of them
 * deletes an account by mistake, a fresh trial is a far smaller problem than a
 * support ticket.
 *
 * Idempotent: `skipDuplicates` means it can be re-run at any time.
 *
 *   npx tsx scripts/db-backfill-trial-claims.ts --dry-run
 *   npx tsx scripts/db-backfill-trial-claims.ts
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  hashTrialEmail,
  normalizeEmailForTrial,
} from "../src/lib/services/trial-claim-hash";

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (!existsSync(full)) continue;
  for (const raw of readFileSync(full, "utf8").split(/\r?\n/)) {
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

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

async function main() {
  const subscriptions = await prisma.userSubscription.findMany({
    where: { coreExpiresAt: { not: null } },
    select: {
      trialStartedAt: true,
      coreExpiresAt: true,
      user: { select: { email: true } },
    },
  });

  // One row per mailbox, not per account: `a.b@gmail.com` and `ab@gmail.com`
  // are the same inbox and share a hash. Keep the earliest trial.
  const claims = new Map<string, Date>();
  for (const sub of subscriptions) {
    const email = sub.user?.email;
    if (!email) continue;
    const hash = hashTrialEmail(email);
    const at = sub.trialStartedAt ?? new Date();
    const previous = claims.get(hash);
    if (!previous || at < previous) claims.set(hash, at);
  }

  console.log(`subscriptions with a trial : ${subscriptions.length}`);
  console.log(`distinct mailboxes         : ${claims.size}`);

  if (claims.size === 0) {
    console.log("nothing to do");
    return;
  }

  // Show a few normalised examples so the operator can sanity-check the rule
  // without printing a full address list.
  const sample = subscriptions
    .slice(0, 5)
    .map((s) => (s.user?.email ? normalizeEmailForTrial(s.user.email) : "?"))
    .join(", ");
  console.log(`normalised sample          : ${sample}`);

  if (dryRun) {
    console.log("dry run — nothing written");
    return;
  }

  const inserted = await prisma.trialClaim.createMany({
    data: [...claims].map(([emailHash, trialGrantedAt]) => ({
      emailHash,
      trialGrantedAt,
    })),
    skipDuplicates: true,
  });

  const total = await prisma.trialClaim.count();
  console.log(`claims inserted            : ${inserted.count}`);
  console.log(`claims already present     : ${claims.size - inserted.count}`);
  console.log(`trial claims in total      : ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
