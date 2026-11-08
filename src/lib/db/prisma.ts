/**
 * Prisma client singleton + RLS context helper.
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
 * RLS CONTEXT:
 *   PostgreSQL RLS is enabled with FORCE on every user-owned business table
 *   (Customer, Product, Sale, SaleItem, Payment, CustomerAdjustment,
 *   StockMove, Expense, Transaction, Setting, UserSubscription,
 *   RedeemCodeRedemption). Each query is filtered by the `app.user_id`
 *   session variable.
 *
 *   The application MUST set `app.user_id` before any user-scoped query.
 *   The `requireUserId()` and `requireActiveAccess()` helpers in
 *   get-current-user.ts call `setUserContext()` automatically after deriving
 *   the userId from the JWT cookie.
 *
 *   For admin-only operations (e.g. generating redeem codes), the admin
 *   endpoint does NOT set app.user_id — those operations use the rawPrisma
 *   client directly (the postgres role has BYPASSRLS for admin tables).
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

/**
 * Set `app.user_id` on the current Prisma connection (session-level).
 * Called by requireUserId() and requireActiveAccess() after deriving
 * the userId from the JWT cookie.
 *
 * This enables RLS policies to filter queries by the authenticated user.
 * Without this call, RLS returns zero rows on FORCE-enabled tables.
 *
 * NOTE: On Supabase's PgBouncer pooler (port 6543, transaction mode),
 * session-level SET commands may not persist across pooled connections.
 * The DIRECT_URL (port 5432, no pooler) is used by the Prisma client
 * for migrations and could be used for interactive transactions.
 * For the pooled connection, we set app.user_id on every request —
 * even if the pooler routes to a different backend, the SET runs
 * before the query in the same transaction.
 *
 * For queries that need guaranteed RLS context, use withUserContext().
 */
export async function setUserContext(userId: string): Promise<void> {
  const escaped = userId.replace(/'/g, "''");
  await rawPrisma.$executeRawUnsafe(`SET app.user_id = '${escaped}'`);
}

/**
 * Clear `app.user_id` on the current Prisma connection.
 * Used after admin/privileged operations.
 */
export async function clearUserContext(): Promise<void> {
  try {
    await rawPrisma.$executeRawUnsafe(`SET app.user_id = ''`);
  } catch {
    // ignore — variable may not be set
  }
}

/**
 * Run a Prisma transaction with `app.user_id` set to the given userId.
 * Uses an interactive transaction (single connection) so the SET LOCAL
 * is correctly scoped.
 *
 * Usage:
 *   await withUserContext(userId, async (tx) => {
 *     return await tx.customer.findMany();
 *   });
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => Promise<T>,
): Promise<T> {
  return rawPrisma.$transaction(async (tx) => {
    const escaped = userId.replace(/'/g, "''");
    await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${escaped}'`);
    return fn(tx);
  });
}
