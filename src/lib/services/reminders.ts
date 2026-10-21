/**
 * Reminder service layer.
 *
 * Reminders are always owned by exactly one user (userId is required), so
 * every query filters by userId — there is no legacy "global" reminder.
 *
 * A reminder can optionally link to a customer, supplier or product. When it
 * does, the linked record's `nextFollowUpAt` is kept in sync with the EARLIEST
 * open reminder for that record (derived cache, never the source of truth).
 */

import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { invalidateCache } from "@/lib/utils/cache";
import { startOfTodayInTz } from "@/lib/utils/date";
import { listOutstandingCustomers } from "@/lib/services/customers";
import {
  createReminderSchema,
  updateReminderSchema,
  snoozeReminderSchema,
  type CreateReminderInput,
} from "@/lib/schemas/reminder";
import type { Prisma } from "@prisma/client";

const reminderInclude = {
  customer: { select: { name: true, phone: true } },
  supplier: { select: { name: true, phone: true } },
  product: { select: { name: true } },
} satisfies Prisma.ReminderInclude;

type ReminderRow = Prisma.ReminderGetPayload<{ include: typeof reminderInclude }>;

export type ReminderView = {
  id: string;
  title: string;
  notes: string | null;
  type: string;
  dueAt: Date;
  completedAt: Date | null;
  priority: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** Live balance for the linked customer — used for pre-filled messages. */
  customerBalance: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierPhone: string | null;
  productId: string | null;
  productName: string | null;
  createdAt: Date;
};

export type ReminderFilter = "overdue" | "today" | "upcoming" | "completed" | "all";

export type ReminderCounts = {
  overdue: number;
  today: number;
  upcoming: number;
  completed: number;
};

function toView(r: ReminderRow): ReminderView {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    type: r.type,
    dueAt: r.dueAt,
    completedAt: r.completedAt,
    priority: r.priority,
    customerId: r.customerId,
    customerName: r.customer?.name ?? null,
    customerPhone: r.customer?.phone ?? null,
    customerBalance: null,
    supplierId: r.supplierId,
    supplierName: r.supplier?.name ?? null,
    supplierPhone: r.supplier?.phone ?? null,
    productId: r.productId,
    productName: r.product?.name ?? null,
    createdAt: r.createdAt,
  };
}

/**
 * Attach the live outstanding balance of each linked customer so a reminder
 * card can offer a ready-to-send WhatsApp message with the real amount.
 * One cached aggregate for the whole list, not a query per row.
 */
async function attachCustomerBalances(
  rows: ReminderView[],
  userId: string,
): Promise<ReminderView[]> {
  if (!rows.some((r) => r.customerId)) return rows;

  const outstanding = await listOutstandingCustomers(userId);
  const balanceById = new Map(outstanding.map((c) => [c.id, c.balance]));

  return rows.map((r) =>
    r.customerId ? { ...r, customerBalance: balanceById.get(r.customerId) ?? null } : r,
  );
}

function dayBounds(timezone: string) {
  const todayStart = startOfTodayInTz(timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  return { todayStart, tomorrowStart };
}

function whereFor(
  filter: ReminderFilter,
  userId: string,
  timezone: string,
): Prisma.ReminderWhereInput {
  const { todayStart, tomorrowStart } = dayBounds(timezone);
  switch (filter) {
    case "overdue":
      return { userId, completedAt: null, dueAt: { lt: todayStart } };
    case "today":
      return { userId, completedAt: null, dueAt: { gte: todayStart, lt: tomorrowStart } };
    case "upcoming":
      return { userId, completedAt: null, dueAt: { gte: tomorrowStart } };
    case "completed":
      return { userId, completedAt: { not: null } };
    default:
      return { userId };
  }
}

/** List reminders for one filter (default: all), newest deadline first. */
export async function listReminders(
  filter: ReminderFilter = "all",
  userId?: string | null,
  timezone = "Asia/Karachi",
): Promise<ReminderView[]> {
  if (!userId) return [];
  const rows = await prisma.reminder.findMany({
    where: whereFor(filter, userId, timezone),
    include: reminderInclude,
    orderBy: filter === "completed" ? { completedAt: "desc" } : { dueAt: "asc" },
    take: 200,
  });
  return attachCustomerBalances(rows.map(toView), userId);
}

/** Counts for the filter tabs / dashboard badge. */
export async function getReminderCounts(
  userId?: string | null,
  timezone = "Asia/Karachi",
): Promise<ReminderCounts> {
  if (!userId) return { overdue: 0, today: 0, upcoming: 0, completed: 0 };

  const [overdue, today, upcoming, completed] = await Promise.all([
    prisma.reminder.count({ where: whereFor("overdue", userId, timezone) }),
    prisma.reminder.count({ where: whereFor("today", userId, timezone) }),
    prisma.reminder.count({ where: whereFor("upcoming", userId, timezone) }),
    prisma.reminder.count({ where: whereFor("completed", userId, timezone) }),
  ]);
  return { overdue, today, upcoming, completed };
}

/** Fetch one reminder (404 if not owned). */
export async function getReminder(
  id: string,
  userId?: string | null,
): Promise<ReminderView> {
  if (!userId) throw new NotFoundError("api.resource.reminder", id);
  const row = await prisma.reminder.findFirst({
    where: { id, userId },
    include: reminderInclude,
  });
  if (!row) throw new NotFoundError("api.resource.reminder", id);
  const [view] = await attachCustomerBalances([toView(row)], userId);
  return view!;
}

/**
 * Recompute nextFollowUpAt for a linked customer/supplier from its earliest
 * open reminder. Called after every mutation that can change the answer.
 */
async function syncFollowUps(
  tx: Prisma.TransactionClient,
  userId: string,
  links: { customerId?: string | null; supplierId?: string | null },
): Promise<void> {
  if (links.customerId) {
    const next = await tx.reminder.findFirst({
      where: { userId, customerId: links.customerId, completedAt: null },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    });
    await tx.customer.update({
      where: { id: links.customerId },
      data: { nextFollowUpAt: next?.dueAt ?? null },
    });
  }
  if (links.supplierId) {
    const next = await tx.reminder.findFirst({
      where: { userId, supplierId: links.supplierId, completedAt: null },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    });
    await tx.supplier.update({
      where: { id: links.supplierId },
      data: { nextFollowUpAt: next?.dueAt ?? null },
    });
  }
}

/** Verify every linked record belongs to this tenant. */
async function assertLinksOwned(
  tx: Prisma.TransactionClient,
  userId: string,
  data: Pick<CreateReminderInput, "customerId" | "supplierId" | "productId">,
): Promise<void> {
  if (data.customerId) {
    const found = await tx.customer.findFirst({
      where: { id: data.customerId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("api.resource.customer", data.customerId);
  }
  if (data.supplierId) {
    const found = await tx.supplier.findFirst({
      where: { id: data.supplierId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("api.resource.supplier", data.supplierId);
  }
  if (data.productId) {
    const found = await tx.product.findFirst({
      where: { id: data.productId, isDeleted: false, OR: [{ userId }, { userId: null }] },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("api.resource.product", data.productId);
  }
}

function invalidateReminderCaches() {
  invalidateCache("reminders");
  invalidateCache("dashboard");
  invalidateCache("customers");
  invalidateCache("suppliers");
}

/** Create a reminder. */
export async function createReminder(
  input: unknown,
  userId: string,
): Promise<ReminderView> {
  const data = createReminderSchema.parse(input);

  const created = await prisma.$transaction(async (tx) => {
    await assertLinksOwned(tx, userId, data);

    const reminder = await tx.reminder.create({
      data: {
        userId,
        title: data.title,
        notes: data.notes ?? null,
        type: data.type,
        dueAt: data.dueAt,
        priority: data.priority,
        customerId: data.customerId ?? null,
        supplierId: data.supplierId ?? null,
        productId: data.productId ?? null,
      },
      include: reminderInclude,
    });

    await syncFollowUps(tx, userId, {
      customerId: reminder.customerId,
      supplierId: reminder.supplierId,
    });

    return reminder;
  });

  invalidateReminderCaches();
  return toView(created);
}

/** Update a reminder (partial). */
export async function updateReminder(
  id: string,
  input: unknown,
  userId: string,
): Promise<ReminderView> {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError("api.resource.reminder", id);

  const data = updateReminderSchema.parse(input);

  const updated = await prisma.$transaction(async (tx) => {
    await assertLinksOwned(tx, userId, data);

    const reminder = await tx.reminder.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.notes !== undefined && { notes: data.notes ?? null }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.dueAt !== undefined && { dueAt: data.dueAt }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.customerId !== undefined && { customerId: data.customerId ?? null }),
        ...(data.supplierId !== undefined && { supplierId: data.supplierId ?? null }),
        ...(data.productId !== undefined && { productId: data.productId ?? null }),
      },
      include: reminderInclude,
    });

    // Sync both the old and the new link (a reminder may have been re-linked).
    await syncFollowUps(tx, userId, {
      customerId: existing.customerId,
      supplierId: existing.supplierId,
    });
    if (
      reminder.customerId !== existing.customerId ||
      reminder.supplierId !== existing.supplierId
    ) {
      await syncFollowUps(tx, userId, {
        customerId: reminder.customerId,
        supplierId: reminder.supplierId,
      });
    }

    return reminder;
  });

  invalidateReminderCaches();
  return toView(updated);
}

/** Mark a reminder complete (or reopen it). */
export async function setReminderCompleted(
  id: string,
  completed: boolean,
  userId: string,
): Promise<ReminderView> {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError("api.resource.reminder", id);

  const updated = await prisma.$transaction(async (tx) => {
    const reminder = await tx.reminder.update({
      where: { id },
      data: { completedAt: completed ? new Date() : null },
      include: reminderInclude,
    });
    await syncFollowUps(tx, userId, {
      customerId: reminder.customerId,
      supplierId: reminder.supplierId,
    });
    return reminder;
  });

  invalidateReminderCaches();
  return toView(updated);
}

/**
 * Push a reminder back by `days` without losing it.
 *
 * Snoozing counts from *now* when the reminder is already due (so a week-late
 * reminder becomes due tomorrow, not already-overdue again), and from its own
 * due date when it is still in the future. A snoozed reminder is reopened.
 */
export async function snoozeReminder(
  id: string,
  days: number,
  userId: string,
): Promise<ReminderView> {
  const { days: parsedDays } = snoozeReminderSchema.parse({ days });

  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError("api.resource.reminder", id);

  const base = Math.max(existing.dueAt.getTime(), Date.now());
  const dueAt = new Date(base + parsedDays * 86_400_000);

  const updated = await prisma.$transaction(async (tx) => {
    const reminder = await tx.reminder.update({
      where: { id },
      data: { dueAt, completedAt: null },
      include: reminderInclude,
    });
    await syncFollowUps(tx, userId, {
      customerId: reminder.customerId,
      supplierId: reminder.supplierId,
    });
    return reminder;
  });

  invalidateReminderCaches();
  return toView(updated);
}

/** Delete a reminder permanently. */
export async function deleteReminder(
  id: string,
  userId: string,
): Promise<{ id: string; deleted: true }> {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError("api.resource.reminder", id);

  await prisma.$transaction(async (tx) => {
    await tx.reminder.delete({ where: { id } });
    await syncFollowUps(tx, userId, {
      customerId: existing.customerId,
      supplierId: existing.supplierId,
    });
  });

  invalidateReminderCaches();
  return { id, deleted: true };
}
