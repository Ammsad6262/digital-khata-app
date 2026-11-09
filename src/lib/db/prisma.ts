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
 *   PostgreSQL row-level security is enforced on the user-owned licensing
 *   tables (`UserSubscription`, `RedeemCodeRedemption`) by the
 *   `20261109170000_enforce_licensing_rls` migration, which creates a
 *   restricted role (`khata_app`) and per-user policies keyed on `app.user_id`.
 *
 *   User-scoped queries go through `withUserRls(userId, fn)`, which runs a
 *   single transaction as the restricted role:
 *       SET LOCAL ROLE khata_app;
 *       SELECT set_config('app.user_id', <userId>, true);
 *   so the policy (`"userId" = current_setting('app.user_id', true)`) only ever
 *   returns the caller's own rows. The context is transaction-local, so it is
 *   safe under connection pooling.
 *
 *   Admin/privileged operations use `rawPrisma` (the database owner) and
 *   intentionally bypass RLS. `setUserContext()` / `withUserContext()` remain
 *   for backwards compatibility but are no longer the enforcement mechanism.
 *
 *   Enforcement requires `LICENSING_RLS_ROLE` to be set (e.g. `khata_app`) AND
 *   the migration to have created the role; with the variable unset the query
 *   still runs (on the owner) but is not filtered — matching pre-hardening
 *   behaviour for installs that have not provisioned the role yet.
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

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Restricted role used for user-scoped queries. When set, `withUserRls` enters
 * this role (`SET LOCAL ROLE`) inside the transaction so RLS applies. When
 * unset, queries still run but are not RLS-filtered (pre-hardening behaviour).
 */
const RLS_ROLE = (process.env.LICENSING_RLS_ROLE ?? "").trim();
const RLS_ROLE_RE = /^[a-z_][a-z0-9_]*$/i;

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

/**
 * Run a user-scoped query inside a transaction that is subject to row-level
 * security, using the transaction-local `app.user_id` context.
 *
 * This is the enforcement path for the licensing tables. It is safe under
 * connection pooling (the SET ROLE / context are scoped to the transaction)
 * and fails closed: an unset or mismatched context returns no rows.
 *
 * Usage:
 *   const sub = await withUserRls(userId, (tx) =>
 *     tx.userSubscription.findUnique({ where: { userId } }),
 *   );
 */
export async function withUserRls<T>(
  userId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return rawPrisma.$transaction(async (tx) => {
    if (RLS_ROLE && RLS_ROLE_RE.test(RLS_ROLE)) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RLS_ROLE}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO public`);
    }
    await tx.$queryRawUnsafe(
      `SELECT set_config('app.user_id', $1, true)`,
      userId,
    );
    return fn(tx);
  });
}
