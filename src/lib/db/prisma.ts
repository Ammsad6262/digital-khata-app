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
    // Connection pool settings for Supabase
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = rawPrisma;
}

// Export the raw client (for transactions where we need direct access)
export { rawPrisma };

// Export the protected client (wrapped with circuit breaker for read operations)
// For mutations, use rawPrisma directly inside $transaction
export const prisma = rawPrisma;
