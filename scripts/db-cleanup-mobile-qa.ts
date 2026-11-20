/**
 * Remove the QA accounts created by the mobile app's browser E2E
 * (D:\dukhata-mobile\scripts\e2e-web.mjs).
 *
 * The E2E registers real accounts against production, so a completed run must
 * leave the database exactly as it found it. Trial claims are deleted with the
 * account because claims deliberately outlive users.
 *
 *   npx tsx scripts/db-cleanup-mobile-qa.ts --dry-run
 *   npx tsx scripts/db-cleanup-mobile-qa.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hashTrialEmail } from "../src/lib/services/trial-claim-hash";

for (const file of [".env.local"]) {
  if (!existsSync(file)) continue;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
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

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "qa.", endsWith: "@dukhata-qa.test" } },
    select: { id: true, email: true },
  });

  console.log(`qa.* accounts: ${users.length}`);
  for (const user of users) {
    console.log(`  ${user.email}`);
    if (!dryRun) {
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.trialClaim.deleteMany({
        where: { emailHash: hashTrialEmail(user.email) },
      });
    }
  }

  const remaining = await prisma.user.count({
    where: { email: { startsWith: "qa.", endsWith: "@dukhata-qa.test" } },
  });
  const claims = await prisma.trialClaim.count();

  console.log(`remaining qa users: ${remaining}`);
  console.log(`trial claims now  : ${claims}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });