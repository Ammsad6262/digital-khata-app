/**
 * Overdue payables (money you owe suppliers).
 *
 * A supplier's payable is derived:
 *   openingBalance + SUM(purchase.outstanding) - SUM(supplierPayment.amount)
 *
 * `Purchase.outstanding` is fixed when the purchase is created (total minus
 * the amount paid at purchase time). Later supplier payments may be linked to
 * a specific invoice or left against the supplier's overall balance.
 *
 * For an overdue list we need a per-invoice remaining amount. Payments linked
 * to an invoice are applied to that invoice. Payments with no invoice link are
 * applied to open invoices oldest-due-first, with no-due-date invoices last.
 * This allocation is only for reporting; it never rewrites `Purchase.outstanding`
 * and never changes the supplier payable.
 *
 * Only purchases with a recorded due date can be called overdue. A purchase
 * without a due date is never labelled overdue.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfTodayInTz } from "@/lib/utils/date";

const DAY_MS = 24 * 60 * 60 * 1000;

export type OverduePayable = {
  purchaseId: string;
  supplierId: string;
  supplierName: string;
  /** Total billed on the purchase. */
  totalAmount: string;
  /** Money paid at purchase time. */
  paidAtPurchase: string;
  /** Later payments allocated to this invoice (linked + unlinked). */
  paidSince: string;
  /** What is still owed on this invoice after allocation. */
  remaining: string;
  purchaseDate: string;
  dueDate: string;
  daysOverdue: number;
};

export type OverduePayablesSummary = {
  total: string;
  count: number;
  suppliersCount: number;
  rows: OverduePayable[];
};

type PurchaseForPayables = {
  id: string;
  supplierId: string;
  supplier: { name: string } | null;
  totalAmount: Decimal;
  paidAmount: Decimal;
  outstanding: Decimal;
  date: Date;
  dueDate: Date | null;
};

/**
 * List every open purchase whose due date has passed, oldest first.
 * Scoped to one business.
 */
export async function getOverduePayables(
  userId: string,
): Promise<OverduePayablesSummary> {
  const today = startOfTodayInTz();

  const [purchases, payments] = await Promise.all([
    prisma.purchase.findMany({
      where: { voidedAt: null, userId },
      select: {
        id: true,
        supplierId: true,
        supplier: { select: { name: true } },
        totalAmount: true,
        paidAmount: true,
        outstanding: true,
        date: true,
        dueDate: true,
      },
      orderBy: [{ dueDate: "asc" }, { date: "asc" }],
    }),
    prisma.supplierPayment.findMany({
      where: { voidedAt: null, userId },
      select: { purchaseId: true, supplierId: true, amount: true },
    }),
  ]);

  const linkedPaid = new Map<string, Decimal>();
  const unlinkedPaid = new Map<string, Decimal>();
  for (const payment of payments) {
    const amount = toDecimalOrZero(payment.amount);
    if (payment.purchaseId) {
      linkedPaid.set(
        payment.purchaseId,
        (linkedPaid.get(payment.purchaseId) ?? new Decimal(0)).plus(amount),
      );
    } else {
      unlinkedPaid.set(
        payment.supplierId,
        (unlinkedPaid.get(payment.supplierId) ?? new Decimal(0)).plus(amount),
      );
    }
  }

  const bySupplier = new Map<string, PurchaseForPayables[]>();
  for (const purchase of purchases) {
    const list = bySupplier.get(purchase.supplierId) ?? [];
    list.push(purchase);
    bySupplier.set(purchase.supplierId, list);
  }

  const rows: OverduePayable[] = [];
  let total = new Decimal(0);

  for (const [supplierId, list] of bySupplier) {
    let unallocated = unlinkedPaid.get(supplierId) ?? new Decimal(0);

    const ordered = [...list].sort((a, b) => {
      const aDue = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.date.getTime() - b.date.getTime();
    });

    for (const purchase of ordered) {
      let paid = linkedPaid.get(purchase.id) ?? new Decimal(0);
      let remaining = toDecimalOrZero(purchase.outstanding).minus(paid);

      if (remaining.gt(0) && unallocated.gt(0)) {
        const allocated = remaining.lt(unallocated) ? remaining : unallocated;
        paid = paid.plus(allocated);
        remaining = remaining.minus(allocated);
        unallocated = unallocated.minus(allocated);
      }

      if (
        purchase.dueDate &&
        purchase.dueDate.getTime() < today.getTime() &&
        remaining.gt(0)
      ) {
        const daysOverdue = Math.max(
          0,
          Math.floor((today.getTime() - purchase.dueDate.getTime()) / DAY_MS),
        );
        total = total.plus(remaining);
        rows.push({
          purchaseId: purchase.id,
          supplierId,
          supplierName: purchase.supplier?.name ?? "",
          totalAmount: purchase.totalAmount.toString(),
          paidAtPurchase: purchase.paidAmount.toString(),
          paidSince: paid.toString(),
          remaining: remaining.toString(),
          purchaseDate: purchase.date.toISOString(),
          dueDate: purchase.dueDate.toISOString(),
          daysOverdue,
        });
      }
    }
  }

  rows.sort((a, b) => {
    const byDue = Date.parse(a.dueDate) - Date.parse(b.dueDate);
    if (byDue !== 0) return byDue;
    return a.supplierName.localeCompare(b.supplierName);
  });

  return {
    total: total.toString(),
    count: rows.length,
    suppliersCount: new Set(rows.map((row) => row.supplierId)).size,
    rows,
  };
}
