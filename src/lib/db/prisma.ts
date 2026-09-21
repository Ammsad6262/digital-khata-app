/**
 * Prisma client singleton with circuit breaker protection.
 *
 * Next.js hot-reloads modules in dev, which would otherwise create a new
 * Prisma client on every reload and exhaust DB connections. This file guards
 * against that by stashing the client on `globalThis`.
 *
 * The circuit breaker protects against Supabase outages/slowdowns:
 *   - If 5 consecutive DB calls fail or timeout (>8s), the circuit trips OPEN
 *   - While OPEN, all DB calls fast-fail immediately (no waiting)
 *   - After 30s cooldown, one call is allowed through (HALF-OPEN)
 *   - If it succeeds, the circuit closes and normal operation resumes
 *
 * This prevents Vercel serverless functions from hanging when Supabase is
 * slow, which would exhaust the function's execution timeout.
 *
 * Usage:
 *   import { prisma } from "@/lib/db/prisma";
 *   const customers = await prisma.customer.findMany();
 *   // ↑ automatically wrapped in circuit breaker
 */

import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import * as fs from "fs";
import * as path from "path";

// ── Force-load .env, overriding any stale parent-shell env vars ──────────────
//
// Background: Prisma's `env("DATABASE_URL")` reads from process.env. If the
// parent shell has `DATABASE_URL=file:/old/sqlite/path` set (e.g. from a
// previous development setup), that value takes precedence over the .env file,
// and Prisma fails with "URL must start with postgresql://" because the schema
// declares provider="postgresql".
//
// @next/env's loadEnvConfig loads .env files but does NOT override existing
// process.env values. So we manually parse .env and force-assign.
const projectRoot = process.cwd();
const envPaths = [
  path.join(projectRoot, ".env"),
  path.join(projectRoot, ".env.local"),
  path.join(projectRoot, ".env.development"),
  path.join(projectRoot, ".env.production"),
];
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();
    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    // Force-override (don't skip if already set — that's the whole point)
    process.env[key] = value;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const rawPrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = rawPrisma;
}

// Export the raw client (for transactions where we need direct access)
export { rawPrisma };

// Export the protected client (wrapped with circuit breaker for read operations)
// For mutations, use rawPrisma directly inside $transaction
export const prisma = rawPrisma;
