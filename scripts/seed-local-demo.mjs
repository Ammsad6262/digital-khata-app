import { PrismaClient } from "@prisma/client";

// ── Safety guard ────────────────────────────────────────────────────────────
// This seeder creates a demo account with a fake password hash. It must never
// run against production or any non-local database.
const databaseUrl = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to seed: NODE_ENV=production. This script is for local dev only.",
  );
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(databaseUrl) || !databaseUrl.includes("khata_licensing")) {
  console.error(
    "Refusing to seed: DATABASE_URL must point at the local khata_licensing database.",
  );
  console.error(
    "Set DATABASE_URL to your isolated local licensing database and retry.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const user = await prisma.user.upsert({
  where: { email: "demo@example.com" },
  update: {},
  create: {
    name: "Demo Owner",
    email: "demo@example.com",
    passwordHash: "dev-only-not-a-real-hash",
  },
  select: { id: true, email: true },
});

console.log("seeded local demo account:", user.email, user.id);
await prisma.$disconnect();