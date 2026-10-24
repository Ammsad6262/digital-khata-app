/**
 * Audit trail.
 *
 * Records important changes (money, stock, people, settings, destructive
 * actions) so the owner can see what happened and when. Logging is best-effort:
 * a failure to write an audit row must never roll back the business action
 * that already succeeded. The row is written after the transaction commits.
 *
 * Every query is scoped to the signed-in user. There is no cross-account
 * audit access.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type AuditAction =
  | "sale.create"
  | "sale.void"
  | "payment.create"
  | "payment.update"
  | "payment.void"
  | "purchase.create"
  | "purchase.void"
  | "supplierPayment.create"
  | "supplierPayment.void"
  | "expense.create"
  | "expense.update"
  | "expense.void"
  | "customer.create"
  | "customer.update"
  | "customer.delete"
  | "supplier.create"
  | "supplier.update"
  | "supplier.delete"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "stock.adjust"
  | "settings.update"
  | "backup.import"
  | "data.clear"
  | "recovery.contact"
  | "followUp.update";

export type AuditInput = {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type AuditLogView = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
};

/**
 * Write one audit row. Never throws: the caller has already committed the
 * real change, and losing an audit row is better than showing the owner a
 * failed sale that actually saved.
 */
export async function recordAudit(
  userId: string,
  input: AuditInput,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    console.error("audit log write failed", error);
  }
}

/**
 * Most recent audit rows for this owner. The page filters by group, so 200
 * rows is enough for a small business and avoids paging complexity.
 */
export async function listAuditLogs(
  userId: string,
  limit = 200,
): Promise<AuditLogView[]> {
  const rows = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }));
}
