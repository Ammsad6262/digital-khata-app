/**
 * Follow-up service — the "AI Sales Growth Assistant" workflow.
 *
 * Two halves:
 *   1. `getFollowUpCandidates()` finds opportunities from the owner's own
 *      sales history: a customer who is past their usual buying interval for
 *      a product, or a customer who has stopped buying altogether. Every
 *      figure is counted from real rows; nothing is predicted or invented.
 *   2. `createFollowUp` / `updateFollowUp` let the owner keep the ones worth
 *      working on, edit the message, and record what actually happened.
 *
 * Outcomes are always recorded by the owner. Opening WhatsApp is never
 * treated as "contacted", and a message is never marked as sent.
 */

import { prisma } from "@/lib/db/prisma";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { invalidateCache } from "@/lib/utils/cache";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { listOutstandingCustomers } from "@/lib/services/customers";

export const FOLLOW_UP_OUTCOMES = [
  "pending",
  "contacted",
  "interested",
  "order_placed",
  "not_interested",
  "no_response",
] as const;

export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

/** Outcomes that mean the owner is still working the opportunity. */
const OPEN_OUTCOMES: FollowUpOutcome[] = ["pending", "contacted", "interested"];

/** Outcomes that close it, one way or another. */
const CLOSED_OUTCOMES: FollowUpOutcome[] = [
  "order_placed",
  "not_interested",
  "no_response",
];

/** How much later than usual a purchase has to be before we mention it. */
const OVERDUE_RATIO = 1.25;
/** Ignore customers whose pattern is too short to mean anything. */
const MIN_PURCHASES_FOR_INTERVAL = 2;
const MIN_INTERVAL_DAYS = 2;
/** Give a new relationship a chance before calling it inactive. */
const MIN_DAYS_SINCE_LAST = 7;

export type FollowUpCandidate = {
  /** Deterministic key so the UI can de-duplicate renders. */
  id: string;
  kind: "reorder" | "inactive";
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  /** Outstanding balance of the customer right now (may be 0). */
  balance: string;
  productId: string | null;
  productName: string | null;
  productUnit: string | null;
  timesPurchased: number;
  lastPurchaseAt: string;
  daysSinceLastPurchase: number;
  averageIntervalDays: number | null;
  /** One line of evidence, in plain words. */
  reason: string;
  /** An open follow-up already exists for this customer/product. */
  existingFollowUpId: string | null;
};

export type FollowUpView = {
  id: string;
  kind: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  productId: string | null;
  productName: string | null;
  reason: string;
  message: string;
  outcome: FollowUpOutcome;
  outcomeNote: string | null;
  contactedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FollowUpStats = {
  open: number;
  contacted: number;
  interested: number;
  orderPlaced: number;
  notInterested: number;
  noResponse: number;
  /** Closed opportunities (everything except pending). */
  worked: number;
  /** orderPlaced / worked, as a percentage — null until something is worked. */
  conversionPct: number | null;
};

const followUpInclude = {
  customer: { select: { name: true, phone: true } },
  product: { select: { name: true, unit: true } },
} as const;

type FollowUpRow = {
  id: string;
  kind: string;
  customerId: string;
  customer: { name: string; phone: string | null };
  productId: string | null;
  product: { name: string; unit: string } | null;
  reason: string;
  message: string;
  outcome: string;
  outcomeNote: string | null;
  contactedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toView(row: FollowUpRow): FollowUpView {
  return {
    id: row.id,
    kind: row.kind,
    customerId: row.customerId,
    customerName: row.customer.name,
    customerPhone: row.customer.phone ?? null,
    productId: row.productId,
    productName: row.product?.name ?? null,
    reason: row.reason,
    message: row.message,
    outcome: (FOLLOW_UP_OUTCOMES as readonly string[]).includes(row.outcome)
      ? (row.outcome as FollowUpOutcome)
      : "pending",
    outcomeNote: row.outcomeNote,
    contactedAt: row.contactedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

/**
 * Find customers worth calling — derived only from their own purchase dates.
 *
 * A product is "due" when the gap since the last purchase is at least 1.25×
 * the customer's average gap for that product. A customer is "inactive" when
 * their overall gap is at least 1.5× their average. Both need real history.
 */
export async function getFollowUpCandidates(userId: string): Promise<FollowUpCandidate[]> {
  const [lines, outstanding, openFollowUps] = await Promise.all([
    prisma.saleItem.findMany({
      where: { sale: { userId, voidedAt: null } },
      select: {
        productId: true,
        sale: { select: { customerId: true, date: true } },
        product: { select: { name: true, unit: true } },
      },
      orderBy: { sale: { date: "asc" } },
      take: 5000,
    }),
    listOutstandingCustomers(userId),
    prisma.followUp.findMany({
      where: { userId, outcome: { in: OPEN_OUTCOMES } },
      select: { id: true, customerId: true, productId: true },
    }),
  ]);

  if (lines.length === 0) return [];

  const balanceById = new Map(outstanding.map((c) => [c.id, c.balance]));
  const openKey = new Map(
    openFollowUps.map((f) => [`${f.customerId}:${f.productId ?? "*"}`, f.id]),
  );

  // customer -> product -> purchase dates
  const perProduct = new Map<
    string,
    {
      customerId: string;
      productId: string;
      name: string;
      unit: string;
      dates: Date[];
    }
  >();
  const perCustomer = new Map<string, Date[]>();

  for (const line of lines) {
    const customerId = line.sale.customerId;
    const date = line.sale.date;

    const customerDates = perCustomer.get(customerId) ?? [];
    customerDates.push(date);
    perCustomer.set(customerId, customerDates);

    const key = `${customerId}:${line.productId}`;
    const entry = perProduct.get(key) ?? {
      customerId,
      productId: line.productId,
      name: line.product.name,
      unit: line.product.unit,
      dates: [],
    };
    entry.dates.push(date);
    perProduct.set(key, entry);
  }

  // Only the customers whose details we actually need.
  const customerIds = [...new Set([...perProduct.values()].map((e) => e.customerId))];
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds }, userId, isDeleted: false },
    select: { id: true, name: true, phone: true },
  });
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const candidates: FollowUpCandidate[] = [];

  for (const [key, entry] of perProduct) {
    const customerId = entry.customerId;
    const customer = customerById.get(customerId);
    if (!customer) continue;

    const dates = entry.dates;
    if (dates.length < MIN_PURCHASES_FOR_INTERVAL) continue;

    const last = dates[dates.length - 1]!;
    const sinceLast = daysSince(last);
    if (sinceLast < MIN_DAYS_SINCE_LAST) continue;

    // Average gap between consecutive purchases of this product.
    let totalGap = 0;
    for (let i = 1; i < dates.length; i++) {
      totalGap += daysBetween(dates[i - 1]!, dates[i]!);
    }
    const average = totalGap / (dates.length - 1);
    if (average < MIN_INTERVAL_DAYS) continue;
    if (sinceLast < average * OVERDUE_RATIO) continue;

    candidates.push({
      id: `reorder:${customerId}:${entry.productId}`,
      kind: "reorder",
      customerId,
      customerName: customer.name,
      customerPhone: customer.phone ?? null,
      balance: balanceById.get(customerId) ?? "0",
      productId: entry.productId,
      productName: entry.name,
      productUnit: entry.unit,
      timesPurchased: dates.length,
      lastPurchaseAt: last.toISOString(),
      daysSinceLastPurchase: sinceLast,
      averageIntervalDays: Math.round(average),
      reason: `Bought this ${dates.length} time${dates.length === 1 ? "" : "s"} — usually every ${Math.round(average)} days, last one ${sinceLast} days ago.`,
      existingFollowUpId: openKey.get(key) ?? null,
    });
  }

  // Customers who stopped buying anything at all (and are not already
  // flagged per-product above).
  const reorderCustomers = new Set(candidates.map((c) => c.customerId));

  for (const [customerId, dates] of perCustomer) {
    if (reorderCustomers.has(customerId)) continue;
    const customer = customerById.get(customerId);
    if (!customer || dates.length < 3) continue;

    const last = dates[dates.length - 1]!;
    const sinceLast = daysSince(last);
    if (sinceLast < Math.max(MIN_DAYS_SINCE_LAST, 30)) continue;

    let totalGap = 0;
    for (let i = 1; i < dates.length; i++) {
      totalGap += daysBetween(dates[i - 1]!, dates[i]!);
    }
    const average = totalGap / (dates.length - 1);
    if (average < MIN_INTERVAL_DAYS) continue;
    if (sinceLast < average * 1.5) continue;

    candidates.push({
      id: `inactive:${customerId}`,
      kind: "inactive",
      customerId,
      customerName: customer.name,
      customerPhone: customer.phone ?? null,
      balance: balanceById.get(customerId) ?? "0",
      productId: null,
      productName: null,
      productUnit: null,
      timesPurchased: dates.length,
      lastPurchaseAt: last.toISOString(),
      daysSinceLastPurchase: sinceLast,
      averageIntervalDays: Math.round(average),
      reason: `Used to buy about every ${Math.round(average)} days — nothing recorded for ${sinceLast} days.`,
      existingFollowUpId: openKey.get(`${customerId}:*`) ?? null,
    });
  }

  // Strongest signal first: how far past their usual rhythm they are.
  candidates.sort((a, b) => {
    const aRatio = a.averageIntervalDays ? a.daysSinceLastPurchase / a.averageIntervalDays : 0;
    const bRatio = b.averageIntervalDays ? b.daysSinceLastPurchase / b.averageIntervalDays : 0;
    return bRatio - aRatio;
  });

  return candidates.slice(0, 25);
}

export async function listFollowUps(
  userId: string,
  filter: "open" | "resolved" | "all" = "open",
): Promise<FollowUpView[]> {
  const rows = await prisma.followUp.findMany({
    where: {
      userId,
      ...(filter === "open" && { outcome: { in: OPEN_OUTCOMES } }),
      ...(filter === "resolved" && { outcome: { in: CLOSED_OUTCOMES } }),
    },
    include: followUpInclude,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return rows.map((row) => toView(row as unknown as FollowUpRow));
}

export async function getFollowUpStats(userId: string): Promise<FollowUpStats> {
  const groups = await prisma.followUp.groupBy({
    by: ["outcome"],
    where: { userId },
    _count: { _all: true },
  });

  const count = (outcome: string) =>
    groups.find((g) => g.outcome === outcome)?._count._all ?? 0;

  const contacted = count("contacted");
  const interested = count("interested");
  const orderPlaced = count("order_placed");
  const notInterested = count("not_interested");
  const noResponse = count("no_response");

  const worked = contacted + interested + orderPlaced + notInterested + noResponse;

  return {
    open: count("pending") + contacted + interested,
    contacted,
    interested,
    orderPlaced,
    notInterested,
    noResponse,
    worked,
    conversionPct: worked === 0 ? null : Math.round((orderPlaced / worked) * 100),
  };
}

export type CreateFollowUpInput = {
  customerId: string;
  productId?: string | null;
  kind?: string;
  reason: string;
  message: string;
};

/**
 * Save an opportunity the owner wants to work on.
 *
 * Idempotent: if an open follow-up already exists for the same customer and
 * product, it is returned instead of creating a duplicate.
 */
export async function createFollowUp(
  input: CreateFollowUpInput,
  userId: string,
): Promise<{ followUp: FollowUpView; created: boolean }> {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, userId, isDeleted: false },
    select: { id: true },
  });
  if (!customer) throw new NotFoundError("api.resource.customer", input.customerId);

  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!product) throw new NotFoundError("api.resource.product", input.productId);
  }

  const reason = input.reason?.trim();
  const message = input.message?.trim();
  if (!reason || reason.length > 300) throw new BadRequestError("api.followUp.reason");
  if (!message || message.length > 1000) throw new BadRequestError("api.followUp.message");

  const existing = await prisma.followUp.findFirst({
    where: {
      userId,
      customerId: input.customerId,
      productId: input.productId ?? null,
      outcome: { in: OPEN_OUTCOMES },
    },
    include: followUpInclude,
  });

  if (existing) {
    return { followUp: toView(existing as unknown as FollowUpRow), created: false };
  }

  const created = await prisma.followUp.create({
    data: {
      userId,
      customerId: input.customerId,
      productId: input.productId ?? null,
      kind: input.kind === "inactive" ? "inactive" : "reorder",
      reason,
      message,
    },
    include: followUpInclude,
  });

  invalidateCache("dashboard");
  return { followUp: toView(created as unknown as FollowUpRow), created: true };
}

export type UpdateFollowUpInput = {
  message?: string;
  outcome?: FollowUpOutcome;
  outcomeNote?: string | null;
};

/** Edit the message and/or record what happened. */
export async function updateFollowUp(
  id: string,
  input: UpdateFollowUpInput,
  userId: string,
): Promise<FollowUpView> {
  const existing = await prisma.followUp.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError("api.resource.followUp", id);

  const message = input.message?.trim();
  if (message !== undefined && (!message || message.length > 1000)) {
    throw new BadRequestError("api.followUp.message");
  }

  if (input.outcome !== undefined && !FOLLOW_UP_OUTCOMES.includes(input.outcome)) {
    throw new BadRequestError("api.followUp.outcome");
  }

  const now = new Date();
  const isTerminal = input.outcome ? CLOSED_OUTCOMES.includes(input.outcome) : false;

  const updated = await prisma.followUp.update({
    where: { id },
    data: {
      ...(message !== undefined && { message }),
      ...(input.outcome !== undefined && { outcome: input.outcome }),
      ...(input.outcomeNote !== undefined && {
        outcomeNote: input.outcomeNote?.trim() || null,
      }),
      // Only stamp the first contact; re-clicking does not move it.
      ...(input.outcome && input.outcome !== "pending" && !existing.contactedAt
        ? { contactedAt: now }
        : {}),
      // Closing an opportunity stamps when it closed; reopening clears it.
      ...(input.outcome !== undefined
        ? { resolvedAt: isTerminal ? now : null }
        : {}),
    },
    include: followUpInclude,
  });

  invalidateCache("dashboard");
  return toView(updated as unknown as FollowUpRow);
}

/** Totals used by the acceptance tests and the results summary. */
export async function countOrdersFromFollowUps(userId: string): Promise<number> {
  return prisma.followUp.count({ where: { userId, outcome: "order_placed" } });
}

export function formatBalance(value: string | null): string {
  return toDecimalOrZero(value).toString();
}

export { Decimal };
