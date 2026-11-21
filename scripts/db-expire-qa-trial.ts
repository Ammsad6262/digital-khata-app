/**
 * Temporary helper: expire one QA account's subscription so the app's
 * mid-session 403 handling can be tested against the real server.
 *
 *   npx tsx scripts/_expire-qa.ts user@dukhata-qa.test
 *
 * Deleted after use; not part of the suite.
 */
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

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
const email = process.argv[2];

async function main() {
  if (!email) {
    console.error("usage: tsx scripts/_expire-qa.ts <email>");
    process.exitCode = 2;
    return;
  }

  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error("user not found");
    process.exitCode = 1;
    return;
  }

  await prisma.userSubscription.update({
    where: { userId: user.id },
    data: {
      status: "UNACTIVATED",
      coreExpiresAt: past,
      trialExpiresAt: past,
    },
  });

  console.log(`expired: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });