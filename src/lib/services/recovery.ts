/**
 * Payment-recovery service.
 *
 * The recovery list is built only from real records. It never invents a due
 * date, a promise, or a payment.
 *
 * The customer balance uses the same formula as the rest of the app:
 *
 *   opening balance + sales - payments + adjustments = amount owed
 *
 * A payment that is not linked to a specific sale still reduces what the
 * customer owes. For due-date purposes only, those unlinked payments are
 * applied to the oldest open sales first (null due dates last), so an overdue
 * invoice is not shown as unpaid after the customer has already paid it.
 *
 * Money owed is deliberately kept separate from money received. Logging a
 * contact or creating a reminder does not touch the customer's balance.
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { startOfTodayInTz } from "@/lib/utils/date";
import { createReminder, setReminderCompleted } from "@/lib/services/reminders";
import { recordAudit } from "@/lib/services/audit";
import { NotFoundError, BadRequestError } from "@/lib/errors";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecoveryFilter = "all" | "overdue" | "due_soon" | "no_due_date";

export type RecoveryFactor = {
  code:
    | "overdue"
    | "accountBalance"
    | "invoices"
    | "noPayment"
    | "lastPayment"
    | "dueSoon"
    | "noDueDate";
  params: Record<string, string | number>;
};

export type RecoveryCandidate = {
  customerId: string;
  customerName: string;
  phone: string | null;
  /** Everything this customer still owes, due or not. */
  outstanding: string;
  openSales: number;
  /** The part of the balance whose invoice is past its due date. */
  overdueOutstanding: string;
  overdueSales: number;
  oldestDueDate: string | null;
  daysOverdue: number;
  lastPaymentAt: string | null;
  lastPaymentAmount: string | null;
  lastContactAt: string | null;
  nextReminderAt: string | null;
  priority: "high" | "normal" | "low";
  factors: RecoveryFactor[];
};

export type RecoverySummary = {
  totalOutstanding: string;
  overdueOutstanding: string;
  customersCount: number;
  overdueCustomersCount: number;
  oldestOverdueDays: number;
};

export type RecoveryResult = {
  summary: RecoverySummary;
  candidates: RecoveryCandidate[];
};

export type RecoveryContactInput = {
  customerId: string;
  method: "call" | "whatsapp" | "sms" | "in_person" | "other";
  notes?: string | null;
};

export type RecoveryReminderInput = {
  customerId: string;
  days?: number;
};

function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / DAY_MS));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function sumDecimal(values: Decimal[]): Decimal {
  return values.reduce((sum, value) => sum.plus(value), new Decimal(0));
}

async function assertCustomerOwned(userId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId, isDeleted: false },
    select: { id: true, name: true },
  });
  if (!customer) throw new NotFoundError("api.resource.customer", customerId);
  return customer;
}

type SaleRow = {
  id: string;
  customerId: string;
  outstanding: Decimal;
  dueDate: Date | null;
  date: Date;
};

/**
 * Build the recovery list. One row per customer with a positive balance.
 */
export async function getRecoveryData(
  userId: string,
  filter: RecoveryFilter = "all",
): Promise<RecoveryResult> {
  const today = startOfTodayInTz();

  const [customers, sales, payments, adjustments] = await Promise.all([
    prisma.customer.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, phone: true, openingBalance: true },
    }),
    prisma.sale.findMany({
      where: { userId, voidedAt: null },
      select: {
        id: true,
        customerId: true,
        totalAmount: true,
        outstanding: true,
        dueDate: true,
        date: true,
      },
    }),
    prisma.payment.findMany({
      where: { userId, voidedAt: null },
      select: { customerId: true, saleId: true, amount: true, date: true },
    }),
    prisma.customerAdjustment.findMany({
      where: { userId, voidedAt: null },
      select: { customerId: true, amount: true },
    }),
  ]);

  const salesByCustomer = new Map<string, typeof sales>();
  for (const sale of sales) {
    const list = salesByCustomer.get(sale.customerId) ?? [];
    list.push(sale);
    salesByCustomer.set(sale.customerId, list);
  }

  const paidByCustomer = new Map<string, Decimal>();
  const unlinkedPaidByCustomer = new Map<string, Decimal>();
  const lastPaymentByCustomer = new Map<string, { date: Date; amount: string }>();

  for (const payment of payments) {
    const amount = toDecimalOrZero(payment.amount);
    paidByCustomer.set(
      payment.customerId,
      (paidByCustomer.get(payment.customerId) ?? new Decimal(0)).plus(amount),
    );
    if (!payment.saleId) {
      unlinkedPaidByCustomer.set(
        payment.customerId,
        (unlinkedPaidByCustomer.get(payment.customerId) ?? new Decimal(0)).plus(amount),
      );
    }
    const previous = lastPaymentByCustomer.get(payment.customerId);
    if (!previous || payment.date > previous.date) {
      lastPaymentByCustomer.set(payment.customerId, {
        date: payment.date,
        amount: amount.toString(),
      });
    }
  }

  const adjustmentsByCustomer = new Map<string, Decimal>();
  for (const adjustment of adjustments) {
    adjustmentsByCustomer.set(
      adjustment.customerId,
      (adjustmentsByCustomer.get(adjustment.customerId) ?? new Decimal(0)).plus(
        toDecimalOrZero(adjustment.amount),
      ),
    );
  }

  const candidates: RecoveryCandidate[] = [];

  for (const customer of customers) {
    const customerSales = salesByCustomer.get(customer.id) ?? [];
    const totalSales = sumDecimal(
      customerSales.map((sale) => toDecimalOrZero(sale.totalAmount)),
    );
    const totalPayments = paidByCustomer.get(customer.id) ?? new Decimal(0);
    const totalAdjustments = adjustmentsByCustomer.get(customer.id) ?? new Decimal(0);
    const balance = toDecimalOrZero(customer.openingBalance)
      .plus(totalSales)
      .minus(totalPayments)
      .plus(totalAdjustments);

    if (balance.lte(0)) continue;

    // Work out which invoices are still open after applying unlinked payments
    // oldest-due-first. Sale.outstanding already reflects payments linked to
    // that sale; this only fills the gap left by general account payments.
    const openRows: Array<{ sale: SaleRow; remaining: Decimal }> = customerSales
      .map((sale) => ({
        sale: {
          id: sale.id,
          customerId: sale.customerId,
          outstanding: toDecimalOrZero(sale.outstanding),
          dueDate: sale.dueDate,
          date: sale.date,
        },
        remaining: toDecimalOrZero(sale.outstanding),
      }))
      .filter((row) => row.remaining.gt(0))
      .sort((a, b) => {
        if (a.sale.dueDate && b.sale.dueDate) {
          return a.sale.dueDate.getTime() - b.sale.dueDate.getTime();
        }
        if (a.sale.dueDate) return -1;
        if (b.sale.dueDate) return 1;
        return a.sale.date.getTime() - b.sale.date.getTime();
      });

    let unlinked = unlinkedPaidByCustomer.get(customer.id) ?? new Decimal(0);
    for (const row of openRows) {
      if (unlinked.lte(0)) break;
      const applied = Decimal.min(unlinked, row.remaining);
      row.remaining = row.remaining.minus(applied);
      unlinked = unlinked.minus(applied);
    }

    let attributed = sumDecimal(openRows.map((row) => row.remaining));
    // A negative opening balance or a negative adjustment can make the
    // customer's real balance smaller than the sum of the invoices. Apply
    // that credit to the oldest invoices too, so the parts never exceed the
    // total.
    let excess = attributed.minus(balance);
    if (excess.gt(0)) {
      for (const row of openRows) {
        if (excess.lte(0)) break;
        const applied = Decimal.min(excess, row.remaining);
        row.remaining = row.remaining.minus(applied);
        excess = excess.minus(applied);
      }
      attributed = sumDecimal(openRows.map((row) => row.remaining));
    }

    const accountOutstanding = Decimal.max(0, balance.minus(attributed));
    const openRowsWithBalance = openRows.filter((row) => row.remaining.gt(0));
    const overdueRows = openRowsWithBalance.filter(
      (row) => row.sale.dueDate !== null && row.sale.dueDate < today,
    );
    const overdueOutstanding = sumDecimal(overdueRows.map((row) => row.remaining));

    const oldestDueDate =
      openRowsWithBalance
        .map((row) => row.sale.dueDate)
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const oldestOverdueDue =
      overdueRows
        .map((row) => row.sale.dueDate)
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const daysOverdue = oldestOverdueDue ? daysBetween(today, oldestOverdueDue) : 0;

    const payment = lastPaymentByCustomer.get(customer.id);
    const factors: RecoveryFactor[] = [];

    if (overdueOutstanding.gt(0)) {
      factors.push({
        code: "overdue",
        params: { days: daysOverdue, amount: overdueOutstanding.toString() },
      });
    }
    if (accountOutstanding.gt(0)) {
      factors.push({
        code: "accountBalance",
        params: { amount: accountOutstanding.toString() },
      });
    }
    if (openRowsWithBalance.length > 1) {
      factors.push({ code: "invoices", params: { count: openRowsWithBalance.length } });
    }
    if (payment) {
      factors.push({
        code: "lastPayment",
        params: {
          days: daysBetween(today, payment.date),
          amount: payment.amount,
        },
      });
    } else {
      factors.push({ code: "noPayment", params: {} });
    }

    if (!overdueOutstanding.gt(0) && oldestDueDate) {
      const daysUntilDue = daysBetween(oldestDueDate, today);
      if (daysUntilDue <= 7) {
        factors.push({ code: "dueSoon", params: { days: daysUntilDue } });
      }
    }
    if (!oldestDueDate) {
      factors.push({ code: "noDueDate", params: {} });
    }

    const priority: RecoveryCandidate["priority"] =
      daysOverdue >= 7
        ? "high"
        : overdueOutstanding.gt(0)
          ? "normal"
          : "low";

    candidates.push({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone ?? null,
      outstanding: balance.toString(),
      openSales: openRowsWithBalance.length,
      overdueOutstanding: overdueOutstanding.toString(),
      overdueSales: overdueRows.length,
      oldestDueDate: oldestDueDate?.toISOString() ?? null,
      daysOverdue,
      lastPaymentAt: payment?.date.toISOString() ?? null,
      lastPaymentAmount: payment?.amount ?? null,
      lastContactAt: null,
      nextReminderAt: null,
      priority,
      factors,
    });
  }

  // Contact history is only needed for the customers that actually owe money.
  const candidateIds = candidates.map((candidate) => candidate.customerId);
  const [contacts, openReminders] = await Promise.all([
    candidateIds.length
      ? prisma.reminder.findMany({
          where: {
            userId,
            type: "payment_collection",
            customerId: { in: candidateIds },
            completedAt: { not: null },
          },
          orderBy: { completedAt: "desc" },
          select: { customerId: true, completedAt: true },
        })
      : Promise.resolve([]),
    candidateIds.length
      ? prisma.reminder.findMany({
          where: {
            userId,
            type: "payment_collection",
            customerId: { in: candidateIds },
            completedAt: null,
          },
          orderBy: { dueAt: "asc" },
          select: { customerId: true, dueAt: true },
        })
      : Promise.resolve([]),
  ]);

  const lastContact = new Map<string, Date>();
  for (const contact of contacts) {
    if (!contact.customerId || !contact.completedAt || lastContact.has(contact.customerId)) {
      continue;
    }
    lastContact.set(contact.customerId, contact.completedAt);
  }

  const nextReminder = new Map<string, Date>();
  for (const reminder of openReminders) {
    if (!reminder.customerId || nextReminder.has(reminder.customerId)) continue;
    nextReminder.set(reminder.customerId, reminder.dueAt);
  }

  for (const candidate of candidates) {
    candidate.lastContactAt = lastContact.get(candidate.customerId)?.toISOString() ?? null;
    candidate.nextReminderAt = nextReminder.get(candidate.customerId)?.toISOString() ?? null;
  }

  candidates.sort((a, b) => {
    if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
    const aOverdue = new Decimal(a.overdueOutstanding);
    const bOverdue = new Decimal(b.overdueOutstanding);
    if (aOverdue.gt(0) !== bOverdue.gt(0)) return aOverdue.gt(0) ? -1 : 1;
    return new Decimal(b.outstanding).cmp(new Decimal(a.outstanding));
  });

  const filtered =
    filter === "overdue"
      ? candidates.filter((candidate) => new Decimal(candidate.overdueOutstanding).gt(0))
      : filter === "due_soon"
        ? candidates.filter((candidate) => {
            if (
              new Decimal(candidate.overdueOutstanding).gt(0) ||
              !candidate.oldestDueDate
            ) {
              return false;
            }
            return daysBetween(new Date(candidate.oldestDueDate), today) <= 7;
          })
        : filter === "no_due_date"
          ? candidates.filter((candidate) => !candidate.oldestDueDate)
          : candidates;

  let totalOutstanding = new Decimal(0);
  let overdueOutstanding = new Decimal(0);
  let overdueCustomersCount = 0;
  let oldestOverdueDays = 0;

  for (const candidate of candidates) {
    totalOutstanding = totalOutstanding.plus(toDecimalOrZero(candidate.outstanding));
    const overdue = toDecimalOrZero(candidate.overdueOutstanding);
    overdueOutstanding = overdueOutstanding.plus(overdue);
    if (overdue.gt(0)) {
      overdueCustomersCount += 1;
      oldestOverdueDays = Math.max(oldestOverdueDays, candidate.daysOverdue);
    }
  }

  return {
    summary: {
      totalOutstanding: totalOutstanding.toString(),
      overdueOutstanding: overdueOutstanding.toString(),
      customersCount: candidates.length,
      overdueCustomersCount,
      oldestOverdueDays,
    },
    candidates: filtered,
  };
}

/**
 * Record that the owner actually contacted a customer. This creates a
 * completed payment-collection reminder, so the contact has a real, dated
 * record. It does not change the balance.
 */
export async function logRecoveryContact(
  userId: string,
  input: RecoveryContactInput,
): Promise<{ id: string; completedAt: string }> {
  if (!input.customerId) throw new BadRequestError("recovery.customerRequired");
  const customer = await assertCustomerOwned(userId, input.customerId);

  const methodLabel: Record<RecoveryContactInput["method"], string> = {
    call: "Call",
    whatsapp: "WhatsApp",
    sms: "SMS",
    in_person: "In person",
    other: "Other",
  };
  if (!methodLabel[input.method]) {
    throw new BadRequestError("recovery.methodRequired");
  }

  const notes = [methodLabel[input.method], input.notes?.trim()]
    .filter(Boolean)
    .join(" · ");

  const reminder = await createReminder(
    {
      title: `Payment contact: ${customer.name}`.slice(0, 150),
      notes: notes.slice(0, 1000),
      type: "payment_collection",
      dueAt: new Date(),
      priority: "normal",
      customerId: customer.id,
    },
    userId,
  );

  const completed = await setReminderCompleted(reminder.id, true, userId);

  await recordAudit(userId, {
    action: "recovery.contact",
    entityType: "Customer",
    entityId: customer.id,
    summary: `Payment recovery contact: ${customer.name}`,
    metadata: { method: input.method },
  });

  return {
    id: completed.id,
    completedAt: (completed.completedAt ?? new Date()).toISOString(),
  };
}

/**
 * Create a real, open reminder to collect from this customer. The reminder
 * is linked to the customer and appears in the normal Reminders module.
 */
export async function createRecoveryReminder(
  userId: string,
  input: RecoveryReminderInput,
): Promise<{ id: string; dueAt: string }> {
  if (!input.customerId) throw new BadRequestError("recovery.customerRequired");
  const customer = await assertCustomerOwned(userId, input.customerId);

  const days = Number.isInteger(input.days)
    ? Math.min(Math.max(input.days ?? 1, 1), 365)
    : 1;

  const balance = await prisma.customer.findFirst({
    where: { id: customer.id, userId, isDeleted: false },
    select: { openingBalance: true },
  });
  const [salesAgg, paymentsAgg, adjustmentsAgg] = await Promise.all([
    prisma.sale.aggregate({
      where: { userId, customerId: customer.id, voidedAt: null },
      _sum: { totalAmount: true },
    }),
    prisma.payment.aggregate({
      where: { userId, customerId: customer.id, voidedAt: null },
      _sum: { amount: true },
    }),
    prisma.customerAdjustment.aggregate({
      where: { userId, customerId: customer.id, voidedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const outstanding = toDecimalOrZero(balance?.openingBalance)
    .plus(toDecimalOrZero(salesAgg._sum.totalAmount))
    .minus(toDecimalOrZero(paymentsAgg._sum.amount))
    .plus(toDecimalOrZero(adjustmentsAgg._sum.amount));

  const title =
    outstanding.gt(0)
      ? `Collect ${outstanding.toString()} from ${customer.name}`
      : `Collect payment from ${customer.name}`;

  const reminder = await createReminder(
    {
      title: title.slice(0, 150),
      notes: "Created from Payment Recovery",
      type: "payment_collection",
      dueAt: addDays(startOfTodayInTz(), days),
      priority: outstanding.gt(0) ? "high" : "normal",
      customerId: customer.id,
    },
    userId,
  );

  return { id: reminder.id, dueAt: reminder.dueAt.toISOString() };
}
