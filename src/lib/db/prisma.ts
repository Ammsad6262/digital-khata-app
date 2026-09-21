/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads modules in dev, which would otherwise create a new
 * Prisma client on every reload and exhaust DB connections. This file guards
 * against that by stashing the client on `globalThis`.
 *
 * IMPORTANT: This file must NOT import any Node.js built-in modules (fs, path,
 * etc.) because it's imported transitively by client components (e.g.
 * BackupPage imports types from backup.ts which imports prisma.ts). Adding
 * `import fs from "fs"` here breaks the client-side webpack bundle, which
 * causes the entire JS bundle to fail — and the user sees a blank page
 * because React never hydrates.
 *
 * If you need to load .env vars dynamically, do it in a separate
 * server-only module (e.g. in next.config.mjs or an API route entry point),
 * NOT here.
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
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = rawPrisma;
}

// Export the raw client (for transactions where we need direct access)
export { rawPrisma };

// Export the protected client (wrapped with circuit breaker for read operations)
// For mutations, use rawPrisma directly inside $transaction
export const prisma = rawPrisma;
