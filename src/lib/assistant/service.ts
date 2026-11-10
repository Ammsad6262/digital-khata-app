/**
 * Assistant orchestrator.
 *
 * handleMessage() is the single entry point used by the API:
 *
 *   1. rules  — resolve deterministic commands with zero AI requests
 *   2. AI     — only when the rules cannot decide
 *   3. query  — answer from the real records
 *   4. plan   — prepare a write, store it, and ask the user to confirm
 *
 * confirmAction() then executes a stored plan through the normal service layer,
 * verifies the result, and records it. The same plan id can be confirmed twice
 * without creating a second transaction.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/services/settings";
import { formatMoney } from "@/lib/utils/money";
import { AIExhaustedError } from "@/lib/ai/model-registry";
import { AIUnavailableError } from "@/lib/ai/gemini-client";
import { route, looksLikeBusinessCommand, shouldEscalate } from "./router";
import { aiUnderstand } from "./ai";
import { runQuery, NeedsEntityError, type ResolvedEntity } from "./queries";
import { performAction, buildIdempotencyKey, type ActionResult } from "./actions";
import { loadThread, saveThread } from "./context";
import { getRotationStatus } from "@/lib/ai/model-registry";
import type { SpeechLanguage } from "./language";
import type {
  ActionKind,
  AssistantReply,
  Candidate,
  PlanPayload,
  PlanRequirement,
  PlanValues,
  RouteAction,
  RouteMatch,
  RouteQuery,
  RouterContext,
  Timings,
} from "./types";
import { warningKeysFromEnglish } from "./warnings";

// ────────────────────────────────────────────────────────────────────────────
// Context + entity helpers
// ────────────────────────────────────────────────────────────────────────────

async function loadRouterContext(userId: string): Promise<RouterContext> {
  const [customers, products, suppliers, thread] = await Promise.all([
    prisma.customer.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true },
      take: 500,
    }),
    prisma.product.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, unit: true, sellingPrice: true },
      take: 500,
    }),
    prisma.supplier.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true },
      take: 300,
    }),
    loadThread(userId),
  ]);

  return {
    customers,
    products: products.map((p) => ({ ...p, sellingPrice: p.sellingPrice.toString() })),
    suppliers,
    thread,
  };
}

type NamedEntity = { id: string; name: string };

async function findNamed(
  userId: string,
  kind: "customer" | "product" | "supplier",
  name: string,
): Promise<NamedEntity[]> {
  const needle = name.trim();
  if (!needle) return [];
  const where = {
    userId,
    name: { contains: needle, mode: "insensitive" as const },
    ...(kind === "customer" ? { isDeleted: false } : {}),
    ...(kind === "product" ? { isDeleted: false } : {}),
    ...(kind === "supplier" ? { isDeleted: false } : {}),
  };

  if (kind === "customer") {
    return prisma.customer.findMany({ where, select: { id: true, name: true }, take: 8 });
  }
  if (kind === "product") {
    return prisma.product.findMany({ where, select: { id: true, name: true }, take: 8 });
  }
  return prisma.supplier.findMany({ where, select: { id: true, name: true }, take: 8 });
}

async function resolveNamed(
  userId: string,
  kind: "customer" | "product" | "supplier",
  opts: { id?: string; name?: string },
): Promise<{ entity: NamedEntity | null; candidates: Candidate[] }> {
  if (opts.id) {
    const found =
      kind === "customer"
        ? await prisma.customer.findFirst({ where: { id: opts.id, userId }, select: { id: true, name: true } })
        : kind === "product"
          ? await prisma.product.findFirst({ where: { id: opts.id, userId }, select: { id: true, name: true } })
          : await prisma.supplier.findFirst({ where: { id: opts.id, userId }, select: { id: true, name: true } });
    if (found) return { entity: found, candidates: [] };
  }

  if (!opts.name) return { entity: null, candidates: [] };

  const matches = await findNamed(userId, kind, opts.name);
  if (matches.length === 1) return { entity: matches[0]!, candidates: [] };
  if (matches.length === 0) return { entity: null, candidates: [] };

  return {
    entity: null,
    candidates: matches.map((m) => ({ id: m.id, name: m.name })),
  };
}

function threadPatchFromPayload(payload: PlanPayload, ctx: RouterContext) {
  const patch: Record<string, string> = {};
  if (payload.customerId) {
    const c = ctx.customers.find((x) => x.id === payload.customerId);
    if (c) {
      patch.lastCustomerId = c.id;
      patch.lastCustomerName = c.name;
    }
  }
  if (payload.supplierId) {
    const s = ctx.suppliers.find((x) => x.id === payload.supplierId);
    if (s) {
      patch.lastSupplierId = s.id;
      patch.lastSupplierName = s.name;
    }
  }
  if (payload.productId) {
    const p = ctx.products.find((x) => x.id === payload.productId);
    if (p) {
      patch.lastProductId = p.id;
      patch.lastProductName = p.name;
    }
  }
  return patch;
}

// ────────────────────────────────────────────────────────────────────────────
// Reply builders
// ────────────────────────────────────────────────────────────────────────────

function emptyTimings(): Timings {
  return { totalMs: 0 };
}

function planReply(
  row: { id: string; payload: Prisma.JsonValue },
  payload: PlanPayload,
  meta: { source: "rules" | "ai"; model?: string; requestsUsed: number; timings: Timings },
): AssistantReply {
  const display = payload.display!;
  return {
    kind: "plan",
    actionId: row.id,
    action: payload.action,
    summary: display.summary,
    fields: display.fields,
    warnings: display.warnings,
    warningKeys: display.warningKeys,
    requires: display.requires,
    candidates: display.candidates,
    usedContext: display.usedContext,
    values: display.values,
    missing: display.missing,
    suggested: display.suggested,
    source: meta.source,
    model: meta.model,
    requestsUsed: meta.requestsUsed,
    timings: meta.timings,
  };
}

function errorReply(
  code: "AI_UNAVAILABLE" | "AI_EXHAUSTED" | "AI_SLOW" | "NOT_UNDERSTOOD" | "INVALID_INPUT" | "SERVER",
  text: string,
  preservedText: string,
  timings: Timings,
  extra: { retryAt?: string; requestsUsed?: number } = {},
): AssistantReply {
  return {
    kind: "error",
    code,
    text,
    preservedText,
    retryAt: extra.retryAt,
    requestsUsed: extra.requestsUsed ?? 0,
    timings,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Plan construction
// ────────────────────────────────────────────────────────────────────────────

type PlanBuild = {
  payload: PlanPayload;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  warnings: string[];
  requires: PlanRequirement[];
  candidates: { customers?: Candidate[]; products?: Candidate[]; suppliers?: Candidate[] };
  usedContext: boolean;
  /** Named entities that were not found (offered as "create" buttons). */
  missing?: { customer?: string; product?: string; supplier?: string };
  suggested?: {
    total?: number;
    paidAmount?: number;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
  };
};

async function buildPlanFor(
  userId: string,
  match: RouteAction,
  ctx: RouterContext,
  symbol: string,
): Promise<PlanBuild | AssistantReply> {
  const money = (v: number | string | null | undefined) => formatMoney(v ?? 0, symbol);
  const f = match.fields;
  const requires: PlanRequirement[] = [];
  const warnings: string[] = [];
  const candidates: PlanBuild["candidates"] = {};
  let usedContext = false;

  const payload: PlanPayload = { action: match.action };

  switch (match.action) {
    case "CREATE_SALE": {
      const customer = await resolveNamed(userId, "customer", {
        id: f.customerId,
        name: f.customerName,
      });
      if (customer.candidates.length) {
        candidates.customers = customer.candidates;
        requires.push("customer");
      }
      if (!customer.entity && customer.candidates.length === 0) {
        requires.push("customer");
        warnings.push(
          f.customerName
            ? `No customer named “${f.customerName}” yet. Pick a customer or add them.`
            : "No customer was mentioned.",
        );
      }
      payload.customerId = customer.entity?.id;

      const product = await resolveNamed(userId, "product", {
        id: f.productId,
        name: f.productName,
      });
      if (product.candidates.length) {
        candidates.products = product.candidates;
        requires.push("product");
      }
      if (!product.entity && product.candidates.length === 0) {
        requires.push("product");
        warnings.push(
          f.productName ? `No product named “${f.productName}” yet.` : "No product was mentioned.",
        );
      }
      payload.productId = product.entity?.id;
      payload.customerName = f.customerName;
      payload.productName = f.productName;

      const quantity = f.quantity ?? null;
      if (quantity === null || quantity <= 0) requires.push("quantity");
      payload.quantity = quantity ?? undefined;

      const productRecord = product.entity
        ? ctx.products.find((p) => p.id === product.entity!.id)
        : undefined;
      // Prefer an explicitly spoken unit price, then a spoken total split over
      // the quantity, and only then the catalog price. Using the catalog price
      // when the owner already said "for 5000" would silently change the charge.
      const unitPrice =
        f.unitPrice ??
        (f.total != null && quantity ? Math.round((f.total / quantity) * 100) / 100 : null) ??
        (productRecord ? Number(productRecord.sellingPrice) : null);
      if (unitPrice !== null) payload.unitPrice = unitPrice;
      else requires.push("unitPrice");
      payload.unit = f.unit ?? productRecord?.unit;

      const discount = f.discountAmount ?? 0;
      if (discount) payload.discountAmount = discount;

      const total =
        quantity && unitPrice ? Math.round((quantity * unitPrice - discount) * 100) / 100 : f.total ?? null;
      if (total !== null) payload.total = total;

      payload.paidAmount = f.paidAmount ?? null;
      if (payload.paidAmount === null) requires.push("paidAmount");

      payload.method = f.method;
      payload.date = f.date;

      if (total !== null && payload.paidAmount !== null && payload.paidAmount > total) {
        warnings.push(
          `Paid ${money(payload.paidAmount)} is more than the sale total ${money(total)}.`,
        );
      }
      if (payload.productId && quantity) {
        const stock = await prisma.product.findFirst({
          where: { id: payload.productId, userId },
          select: { name: true, unit: true, openingStock: true },
        });
        if (stock) {
          const moves = await prisma.stockMove.aggregate({
            where: { productId: payload.productId, userId },
            _sum: { quantity: true },
          });
          const current =
            Number(stock.openingStock) + Number(moves._sum.quantity ?? 0);
          if (quantity > current) {
            warnings.push(
              `Only ${current} ${stock.unit} of ${stock.name} in stock — this sale will oversell.`,
            );
          }
        }
      }

      const custName = customer.entity?.name ?? f.customerName ?? "the customer";
      const prodName = product.entity?.name ?? f.productName ?? "the product";
      return {
        payload,
        summary: `Sell ${quantity ?? "?"} ${payload.unit ?? ""} ${prodName} to ${custName}`.replace(/\s+/g, " ").trim(),
        fields: [
          { label: "Customer", value: custName },
          { label: "Product", value: prodName },
          { label: "Quantity", value: `${quantity ?? "?"} ${payload.unit ?? ""}`.trim() },
          { label: "Unit price", value: money(unitPrice) },
          ...(discount ? [{ label: "Discount", value: money(discount) }] : []),
          { label: "Total", value: total === null ? "—" : money(total) },
          {
            label: "Paid now",
            value: payload.paidAmount === null ? "Not stated" : money(payload.paidAmount),
          },
        ],
        warnings,
        requires,
        candidates,
        usedContext,
        missing: {
          customer: !customer.entity && f.customerName ? f.customerName : undefined,
          product: !product.entity && f.productName ? f.productName : undefined,
        },
        suggested: {
          total: total ?? undefined,
          paidAmount: total ?? undefined,
          quantity: quantity ?? undefined,
          unitPrice: unitPrice ?? undefined,
        },
      };
    }

    case "RECORD_PAYMENT": {
      const customer = await resolveNamed(userId, "customer", {
        id: f.customerId,
        name: f.customerName,
      });
      usedContext = !!f.customerId && !f.customerName;
      if (customer.candidates.length) {
        candidates.customers = customer.candidates;
        requires.push("customer");
      } else if (!customer.entity) {
        requires.push("customer");
      }
      payload.customerId = customer.entity?.id;
      payload.customerName = f.customerName;
      payload.amount = (f.amount ?? f.paidAmount ?? undefined) as number | undefined;
      if (!payload.amount || payload.amount <= 0) requires.push("amount");
      payload.method = f.method;
      payload.date = f.date;

      const name = customer.entity?.name ?? f.customerName ?? "the customer";
      return {
        payload,
        summary: `Record ${money(payload.amount)} received from ${name}`,
        fields: [
          { label: "Customer", value: name },
          { label: "Amount", value: money(payload.amount) },
          { label: "Method", value: payload.method ?? "cash" },
        ],
        warnings,
        requires,
        candidates,
        usedContext,
        missing: {
          customer: !customer.entity && f.customerName ? f.customerName : undefined,
        },
      };
    }

    case "SUPPLIER_PAYMENT": {
      const supplier = await resolveNamed(userId, "supplier", {
        id: f.supplierId,
        name: f.supplierName,
      });
      usedContext = !!f.supplierId && !f.supplierName;
      if (supplier.candidates.length) {
        candidates.suppliers = supplier.candidates;
        requires.push("supplier");
      } else if (!supplier.entity) {
        requires.push("supplier");
      }
      payload.supplierId = supplier.entity?.id;
      payload.supplierName = f.supplierName;
      payload.amount = (f.amount ?? f.paidAmount ?? undefined) as number | undefined;
      if (!payload.amount || payload.amount <= 0) requires.push("amount");
      payload.method = f.method;
      payload.date = f.date;

      const name = supplier.entity?.name ?? f.supplierName ?? "the supplier";
      return {
        payload,
        summary: `Pay ${money(payload.amount)} to ${name}`,
        fields: [
          { label: "Supplier", value: name },
          { label: "Amount", value: money(payload.amount) },
          { label: "Method", value: payload.method ?? "cash" },
        ],
        warnings,
        requires,
        candidates,
        usedContext,
        missing: {
          supplier: !supplier.entity && f.supplierName ? f.supplierName : undefined,
        },
      };
    }

    case "CREATE_EXPENSE": {
      payload.amount = (f.amount ?? f.total ?? f.paidAmount ?? undefined) as number | undefined;
      if (!payload.amount || payload.amount <= 0) requires.push("amount");
      payload.expenseName = f.expenseName ?? f.name ?? undefined;
      if (!payload.expenseName) requires.push("name");
      payload.category = f.category ?? "other";
      payload.date = f.date;

      return {
        payload,
        summary: `Record expense ${money(payload.amount)} — ${payload.expenseName ?? "?"}`,
        fields: [
          { label: "Expense", value: payload.expenseName ?? "—" },
          { label: "Amount", value: money(payload.amount) },
          { label: "Category", value: payload.category ?? "other" },
        ],
        warnings,
        requires,
        candidates,
        usedContext,
      };
    }

    case "ADD_STOCK": {
      const product = await resolveNamed(userId, "product", {
        id: f.productId,
        name: f.productName,
      });
      if (product.candidates.length) {
        candidates.products = product.candidates;
        requires.push("product");
      } else if (!product.entity) {
        requires.push("product");
        warnings.push(f.productName ? `No product named “${f.productName}” yet.` : "No product was mentioned.");
      }
      payload.productId = product.entity?.id;
      payload.productName = f.productName;
      payload.quantity = f.quantity ?? undefined;
      if (!payload.quantity || payload.quantity <= 0) requires.push("quantity");

      const productRecord = product.entity ? ctx.products.find((p) => p.id === product.entity!.id) : undefined;
      payload.unit = f.unit ?? productRecord?.unit;

      if (f.unitCost != null) payload.unitCost = f.unitCost;
      else if (f.unitPrice != null) payload.unitCost = f.unitPrice;
      else if (f.total != null && payload.quantity) {
        payload.unitCost = Math.round((f.total / payload.quantity) * 100) / 100;
      }
      payload.date = f.date;
      payload.notes = "Added by assistant";

      const prodName = product.entity?.name ?? f.productName ?? "the product";
      return {
        payload,
        summary: `Add ${payload.quantity ?? "?"} ${payload.unit ?? ""} of ${prodName} to stock`.replace(/\s+/g, " ").trim(),
        fields: [
          { label: "Product", value: prodName },
          { label: "Quantity", value: `${payload.quantity ?? "?"} ${payload.unit ?? ""}`.trim() },
          { label: "Cost per unit", value: payload.unitCost == null ? "product cost" : money(payload.unitCost) },
        ],
        warnings,
        requires,
        candidates,
        usedContext,
        missing: {
          product: !product.entity && f.productName ? f.productName : undefined,
        },
      };
    }

    case "CREATE_PURCHASE": {
      const supplier = await resolveNamed(userId, "supplier", {
        id: f.supplierId,
        name: f.supplierName,
      });
      if (supplier.candidates.length) {
        candidates.suppliers = supplier.candidates;
        requires.push("supplier");
      } else if (!supplier.entity) {
        requires.push("supplier");
        warnings.push(
          f.supplierName ? `No supplier named “${f.supplierName}” yet.` : "No supplier was mentioned.",
        );
      }
      payload.supplierId = supplier.entity?.id;

      const product = await resolveNamed(userId, "product", {
        id: f.productId,
        name: f.productName,
      });
      if (product.candidates.length) {
        candidates.products = product.candidates;
        requires.push("product");
      } else if (!product.entity) {
        requires.push("product");
      }
      payload.productId = product.entity?.id;
      payload.supplierName = f.supplierName;
      payload.productName = f.productName;

      payload.quantity = f.quantity ?? undefined;
      if (!payload.quantity || payload.quantity <= 0) requires.push("quantity");

      const productRecord = product.entity ? ctx.products.find((p) => p.id === product.entity!.id) : undefined;
      payload.unit = f.unit ?? productRecord?.unit;

      const unitCost =
        f.unitCost ?? f.unitPrice ?? (f.total && payload.quantity ? f.total / payload.quantity : null);
      if (unitCost == null) requires.push("unitPrice");
      payload.unitCost = unitCost ?? undefined;
      payload.paidAmount = f.paidAmount ?? 0;
      payload.date = f.date;

      const total = payload.quantity && payload.unitCost ? payload.quantity * payload.unitCost : null;
      const supplierName = supplier.entity?.name ?? f.supplierName ?? "the supplier";
      const prodName = product.entity?.name ?? f.productName ?? "the product";
      return {
        payload,
        summary: `Buy ${payload.quantity ?? "?"} ${payload.unit ?? ""} ${prodName} from ${supplierName}`.replace(/\s+/g, " ").trim(),
        fields: [
          { label: "Supplier", value: supplierName },
          { label: "Product", value: prodName },
          { label: "Quantity", value: `${payload.quantity ?? "?"} ${payload.unit ?? ""}`.trim() },
          { label: "Cost per unit", value: money(payload.unitCost) },
          { label: "Total", value: total === null ? "—" : money(total) },
          { label: "Paid now", value: money(payload.paidAmount) },
        ],
        warnings,
        requires,
        candidates,
        usedContext,
        missing: {
          supplier: !supplier.entity && f.supplierName ? f.supplierName : undefined,
          product: !product.entity && f.productName ? f.productName : undefined,
        },
      };
    }

    case "CREATE_CUSTOMER": {
      payload.name = f.name ?? f.customerName ?? undefined;
      if (!payload.name) requires.push("name");
      return {
        payload,
        summary: `Add customer ${payload.name ?? "?"}`,
        fields: [
          { label: "Name", value: payload.name ?? "—" },
          { label: "Phone", value: f.phone ?? "—" },
        ],
        warnings,
        requires,
        candidates,
        usedContext,
      };
    }

    case "CREATE_SUPPLIER": {
      payload.name = f.name ?? f.supplierName ?? undefined;
      if (!payload.name) requires.push("name");
      return {
        payload,
        summary: `Add supplier ${payload.name ?? "?"}`,
        fields: [{ label: "Name", value: payload.name ?? "—" }],
        warnings,
        requires,
        candidates,
        usedContext,
      };
    }

    case "CREATE_PRODUCT": {
      payload.name = f.name ?? f.productName ?? undefined;
      if (!payload.name) requires.push("name");
      payload.unit = f.unit ?? "piece";
      const selling = f.sellingPrice ?? f.unitPrice ?? f.total ?? null;
      if (selling == null) requires.push("unitPrice");
      payload.sellingPrice = selling ?? undefined;
      payload.purchasePrice = selling ?? undefined;
      if (f.quantity) payload.openingStock = f.quantity;
      return {
        payload,
        summary: `Add product ${payload.name ?? "?"}`,
        fields: [
          { label: "Name", value: payload.name ?? "—" },
          { label: "Unit", value: payload.unit ?? "piece" },
          { label: "Selling price", value: money(payload.sellingPrice) },
          { label: "Purchase price", value: money(payload.purchasePrice) },
          ...(payload.openingStock
            ? [{ label: "Opening stock", value: `${payload.openingStock} ${payload.unit}` }]
            : []),
        ],
        warnings,
        requires,
        candidates,
        usedContext,
      };
    }

    case "CREATE_REMINDER": {
      payload.reminderTitle = f.reminderTitle ?? f.name ?? "Follow up";
      payload.reminderDueAt = f.reminderDueAt ?? new Date(Date.now() + 86_400_000).toISOString();
      payload.reminderPriority = f.reminderPriority ?? "normal";
      payload.reminderType = f.reminderType ?? "custom";
      payload.customerId = f.customerId;
      payload.supplierId = f.supplierId;
      return {
        payload,
        summary: `Reminder: ${payload.reminderTitle}`,
        fields: [
          { label: "Reminder", value: payload.reminderTitle },
          { label: "Due", value: payload.reminderDueAt!.slice(0, 10) },
          { label: "Priority", value: payload.reminderPriority ?? "normal" },
        ],
        warnings,
        requires,
        candidates,
        usedContext,
      };
    }

    case "COMPLETE_REMINDER":
    case "VOID_SALE":
    case "VOID_EXPENSE":
    case "VOID_PAYMENT": {
      payload.targetId = f.targetId;
      if (!payload.targetId) requires.push("targetId");
      const label =
        match.action === "COMPLETE_REMINDER"
          ? "Complete reminder"
          : match.action === "VOID_SALE"
            ? "Void sale"
            : match.action === "VOID_EXPENSE"
              ? "Void expense"
              : "Void payment";
      if (match.action.startsWith("VOID")) {
        warnings.push("This reverses money and inventory. Confirm only if you are sure.");
      }
      return {
        payload,
        summary: label,
        fields: [{ label: "Target", value: payload.targetId ?? "—" }],
        warnings,
        requires,
        candidates,
        usedContext,
      };
    }

    default:
      return errorReply(
        "NOT_UNDERSTOOD",
        "I can't do that yet.",
        "",
        emptyTimings(),
      );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Persistence
// ────────────────────────────────────────────────────────────────────────────

/** Raw parsed values handed to the confirmation card for editing. */
function valuesFromPayload(p: PlanPayload): PlanValues {
  return {
    quantity: p.quantity,
    unit: p.unit,
    unitPrice: p.unitPrice,
    unitCost: p.unitCost,
    total: p.total,
    paidAmount: p.paidAmount ?? undefined,
    amount: p.amount,
    discountAmount: p.discountAmount,
    name: p.name,
    expenseName: p.expenseName,
    phone: p.phone,
    method: p.method,
    sellingPrice: p.sellingPrice,
    purchasePrice: p.purchasePrice,
    openingStock: p.openingStock,
    targetId: p.targetId,
    category: p.category,
    reminderTitle: p.reminderTitle,
    customerName: p.customerName,
    productName: p.productName,
    supplierName: p.supplierName,
  };
}

async function storePlan(
  userId: string,
  build: PlanBuild,
  text: string,
): Promise<{ id: string; payload: PlanPayload; existing: boolean }> {
  const key = buildIdempotencyKey(userId, build.payload.action, build.payload, text);
  const payload = {
    ...build.payload,
    display: {
      summary: build.summary,
      fields: build.fields,
      warnings: build.warnings,
      warningKeys: warningKeysFromEnglish(build.warnings),
      requires: build.requires,
      candidates: build.candidates,
      usedContext: build.usedContext,
      values: valuesFromPayload(build.payload),
      missing: build.missing,
      suggested: build.suggested,
    },
  } satisfies PlanPayload;

  try {
    // Fast path: the same command within the same window returns the same plan.
    const existing = await prisma.assistantAction.findFirst({
      where: { userId, idempotencyKey: key },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (
        existing.status === "PENDING" ||
        existing.status === "EXECUTING" ||
        existing.status === "DONE"
      ) {
        return { id: existing.id, payload: existing.payload as unknown as PlanPayload, existing: true };
      }
      // Only a cancelled or failed plan is replaced. Re-arming an action that is
      // mid-execution could let the same sale post twice.
      const refreshed = await prisma.assistantAction.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          payload: payload as unknown as Prisma.InputJsonValue,
          result: Prisma.DbNull,
          error: null,
          executedAt: null,
        },
        select: { id: true },
      });
      return { id: refreshed.id, payload, existing: false };
    }

    const row = await prisma.assistantAction.create({
      data: {
        userId,
        idempotencyKey: key,
        kind: build.payload.action,
        status: "PENDING",
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { id: row.id, payload, existing: false };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const row = await prisma.assistantAction.findFirst({
        where: { userId, idempotencyKey: key },
        orderBy: { createdAt: "desc" },
      });
      if (row) {
        return { id: row.id, payload: row.payload as unknown as PlanPayload, existing: true };
      }
    }
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────────────────

export type AssistantInput = {
  text?: string;
  audio?: { base64: string; mimeType: string };
  /** Spoken-language hint from the client, used only to shape the reply language. */
  language?: SpeechLanguage;
};

export async function handleMessage(
  userId: string,
  input: AssistantInput,
): Promise<AssistantReply> {
  const started = Date.now();
  const text = (input.text ?? "").trim();
  let transcript: string | null = text || null;
  let requestsUsed = 0;
  let model: string | undefined;
  let aiMs: number | undefined;
  let aiSummary: string | null = null;
  let source: "rules" | "ai" = "rules";

  const ctx = await loadRouterContext(userId);
  const settings = await getSettings(userId);
  const symbol = settings.currencySymbol || "Rs.";

  const ruleStarted = Date.now();
  const ruleMatch: RouteMatch | null = text ? route(text, ctx) : null;
  const ruleMs = Date.now() - ruleStarted;

  // Rules resolve the common, formulaic commands. The model is consulted when
  // the rules found nothing, when they produced only a PARTIAL action (a
  // missing product/quantity — the bug that used to show "the product"), or
  // when the command is written in Urdu/Pashto script the rules cannot read.
  let match: RouteMatch | null = ruleMatch;
  const needsAi = !ruleMatch || shouldEscalate(ruleMatch, text);
  if (needsAi) {
    const businessLike = text ? looksLikeBusinessCommand(text) : true;
    if (text && !businessLike && !ruleMatch) {
      return errorReply(
        "NOT_UNDERSTOOD",
        "I didn't catch a business command. Try “Ali paid 5,000” or “who owes me money?”.",
        text,
        { totalMs: Date.now() - started, ruleMs },
      );
    }

    try {
      const ai = await aiUnderstand(
        ctx,
        input.audio
          ? { audio: input.audio, language: input.language }
          : { text, language: input.language },
      );
      requestsUsed += ai.requestsUsed;
      model = ai.model;
      aiMs = ai.ms;
      aiSummary = ai.summary;
      if (ai.transcript && !transcript) transcript = ai.transcript;
      if (ai.match) {
        match = ai.match;
        source = "ai";
      } else if (!ruleMatch) {
        return {
          kind: "clarify",
          text: ai.clarification ?? "I'm not sure what you want to do. Can you say it differently?",
          source: "ai",
          model,
          requestsUsed,
          timings: { totalMs: Date.now() - started, ruleMs, aiMs },
        };
      }
      // else: keep the rule match and carry on.
    } catch (error) {
      // If the rules already produced a usable match, prefer it over an error.
      if (ruleMatch) {
        match = ruleMatch;
        aiMs = undefined;
      } else {
        const timings = { totalMs: Date.now() - started, ruleMs, aiMs };
        if (error instanceof AIExhaustedError) {
          // "timeout" means the provider was slow, not out of budget — say so,
          // because the fix is different (retry now vs. wait until tomorrow).
          const slow = error.reason === "timeout";
          return errorReply(
            slow ? "AI_SLOW" : "AI_EXHAUSTED",
            slow
              ? "The AI took too long to answer, so I stopped waiting. Your words are saved — tap retry, or use the form below."
              : "The AI models have reached today's free limit. Your command is saved — try again after the limit resets (or use the buttons below).",
            text,
            timings,
            { retryAt: error.retryAt?.toISOString(), requestsUsed },
          );
        }
        if (error instanceof AIUnavailableError) {
          return errorReply(
            "AI_UNAVAILABLE",
            "The AI is not configured on this server.",
            text,
            timings,
            { requestsUsed },
          );
        }
        console.error("[assistant] AI failure:", error);
        return errorReply(
          "SERVER",
          "Something went wrong understanding that. Your command was kept — try again.",
          text,
          timings,
          { requestsUsed },
        );
      }
    }
  }

  // ── Query ──────────────────────────────────────────────────────────────
  const finalMatch = match;
  if (!finalMatch) {
    return errorReply(
      "NOT_UNDERSTOOD",
      "I couldn't understand that one.",
      text,
      { totalMs: Date.now() - started, ruleMs, aiMs },
      { requestsUsed },
    );
  }

  if (finalMatch.type === "query") {
    const resolved = await resolveQueryEntity(userId, finalMatch, ctx);
    try {
      const result = await runQuery(userId, finalMatch, resolved);
      if (resolved) {
        await saveThread(userId, {
          lastCustomerId: resolved.type === "customer" ? resolved.id : undefined,
          lastCustomerName: resolved.type === "customer" ? resolved.name : undefined,
          lastProductId: resolved.type === "product" ? resolved.id : undefined,
          lastProductName: resolved.type === "product" ? resolved.name : undefined,
          lastSupplierId: resolved.type === "supplier" ? resolved.id : undefined,
          lastSupplierName: resolved.type === "supplier" ? resolved.name : undefined,
          lastQuery: finalMatch.query,
        });
      } else {
        await saveThread(userId, { lastQuery: finalMatch.query });
      }
      return {
        kind: "answer",
        text: result.text,
        items: result.items,
        data: result.data,
        source: "database",
        model,
        requestsUsed,
        timings: { totalMs: Date.now() - started, ruleMs, aiMs },
      };
    } catch (error) {
      if (error instanceof NeedsEntityError) {
        const candidates = await candidateList(userId, error.entityType);
        return {
          kind: "clarify",
          text: error.message,
          options: candidates,
          field: "entity",
          source: source === "ai" ? "ai" : "rules",
          model,
          requestsUsed,
          timings: { totalMs: Date.now() - started, ruleMs, aiMs },
        };
      }
      throw error;
    }
  }

  // ── Action ─────────────────────────────────────────────────────────────
  if (finalMatch.type === "action") {
    const build = await buildPlanFor(userId, finalMatch, ctx, symbol);
    if ("kind" in build) return build;

    // When the model understood the command, use its localized one-line
    // summary so an Urdu/Pashto owner sees the confirmation in their language.
    if (source === "ai" && aiSummary) build.summary = aiSummary;

    const stored = await storePlan(userId, build, text || transcript || "");
    if (build.usedContext || stored.payload.customerId || stored.payload.supplierId || stored.payload.productId) {
      await saveThread(userId, threadPatchFromPayload(stored.payload, ctx));
    }

    return planReply(
      { id: stored.id, payload: stored.payload as unknown as Prisma.JsonValue },
      stored.payload,
      {
        source,
        model,
        requestsUsed,
        timings: { totalMs: Date.now() - started, ruleMs, aiMs },
      },
    );
  }

  return errorReply(
    "NOT_UNDERSTOOD",
    "I couldn't understand that one.",
    text,
    { totalMs: Date.now() - started, ruleMs, aiMs },
    { requestsUsed },
  );
}

async function resolveQueryEntity(
  userId: string,
  query: RouteQuery,
  ctx: RouterContext,
): Promise<ResolvedEntity | null> {
  const name = query.entity;
  const wantsCustomer = query.query.startsWith("CUSTOMER");
  const wantsSupplier = query.query.startsWith("SUPPLIER");
  const wantsProduct = query.query === "STOCK_LEVEL";

  if (!wantsCustomer && !wantsSupplier && !wantsProduct) return null;

  const kind = wantsCustomer ? "customer" : wantsSupplier ? "supplier" : "product";

  // Prefer the name the router already matched against the loaded lists.
  if (name) {
    const list =
      kind === "customer" ? ctx.customers : kind === "supplier" ? ctx.suppliers : ctx.products;
    const exact = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (exact) return { id: exact.id, name: exact.name, type: kind };

    const resolved = await resolveNamed(userId, kind, { name });
    if (resolved.entity) return { ...resolved.entity, type: kind };
    if (resolved.candidates.length === 1) {
      const only = resolved.candidates[0]!;
      return { id: only.id, name: only.name, type: kind };
    }
  }

  return null;
}

async function candidateList(
  userId: string,
  type: "customer" | "product" | "supplier",
): Promise<Candidate[]> {
  if (type === "customer") {
    const rows = await prisma.customer.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 12,
    });
    return rows;
  }
  if (type === "product") {
    const rows = await prisma.product.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 12,
    });
    return rows;
  }
  const rows = await prisma.supplier.findMany({
    where: { userId, isDeleted: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 12,
  });
  return rows;
}

// ────────────────────────────────────────────────────────────────────────────
// Confirm / cancel
// ────────────────────────────────────────────────────────────────────────────

export async function confirmAction(
  userId: string,
  actionId: string,
  patch: Partial<PlanPayload> = {},
): Promise<AssistantReply> {
  const started = Date.now();

  const row = await prisma.assistantAction.findFirst({ where: { id: actionId, userId } });
  if (!row) {
    return errorReply("INVALID_INPUT", "That action no longer exists.", "", emptyTimings());
  }

  if (row.status === "DONE") {
    const result = row.result as unknown as ActionResult | null;
    return {
      kind: "answer",
      text: result && result.ok ? `Already saved: ${result.message}` : "Already done.",
      data: result ?? undefined,
      source: "database",
      requestsUsed: 0,
      timings: { totalMs: Date.now() - started },
    };
  }
  if (row.status === "CANCELLED") {
    return errorReply("INVALID_INPUT", "That action was cancelled.", "", emptyTimings());
  }

  // A plan left open for a day would execute at the prices/stock captured then.
  const MAX_PLAN_AGE_MS = 24 * 60 * 60 * 1000;
  if (row.status === "PENDING" && Date.now() - new Date(row.createdAt).getTime() > MAX_PLAN_AGE_MS) {
    await prisma.assistantAction.update({
      where: { id: actionId },
      data: { status: "CANCELLED" },
    });
    return errorReply(
      "INVALID_INPUT",
      "That action has expired. Please say it again.",
      "",
      emptyTimings(),
    );
  }

  const stored = row.payload as unknown as PlanPayload;
  const payload: PlanPayload = { ...stored, ...patch };
  // Never let a patch overwrite the action kind.
  payload.action = stored.action;

  // Conditional transition prevents two concurrent confirms from both executing.
  // A FAILED action may be retried (fix the value, confirm again); PENDING is
  // claimed; EXECUTING/DONE/CANCELLED are never claimed again.
  const claim = await prisma.assistantAction.updateMany({
    where: { id: actionId, userId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "EXECUTING", error: null },
  });
  if (claim.count === 0) {
    const latest = await prisma.assistantAction.findFirst({ where: { id: actionId, userId } });
    if (latest?.status === "DONE") {
      const result = latest.result as unknown as ActionResult | null;
      return {
        kind: "answer",
        text: result && result.ok ? result.message : "Already done.",
        source: "database",
        requestsUsed: 0,
        timings: { totalMs: Date.now() - started },
      };
    }
    return errorReply("INVALID_INPUT", "That action is already being processed.", "", emptyTimings());
  }

  try {
    const result = await performAction(userId, payload);

    await prisma.assistantAction.update({
      where: { id: actionId },
      data: {
        status: result.ok ? "DONE" : "FAILED",
        result: result as unknown as Prisma.InputJsonValue,
        error: result.ok ? null : result.message,
        executedAt: new Date(),
      },
    });

    const ctx = await loadRouterContext(userId);
    await saveThread(userId, threadPatchFromPayload(payload, ctx));

    if (!result.ok) {
      return {
        kind: "error",
        code: "INVALID_INPUT",
        text: result.message,
        preservedText: "",
        requestsUsed: 0,
        timings: { totalMs: Date.now() - started, executeMs: Date.now() - started },
      };
    }

    return {
      kind: "answer",
      text: result.verified ? result.message : `${result.message} (Please double-check this one.)`,
      data: result,
      source: "database",
      requestsUsed: 0,
      timings: { totalMs: Date.now() - started, executeMs: Date.now() - started },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The action failed.";
    await prisma.assistantAction.update({
      where: { id: actionId },
      data: { status: "FAILED", error: message },
    });
    return errorReply("SERVER", message, "", emptyTimings());
  }
}

export async function cancelAction(userId: string, actionId: string): Promise<boolean> {
  const result = await prisma.assistantAction.updateMany({
    where: { id: actionId, userId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  return result.count > 0;
}

export type AssistantStatus = {
  /** True when at least one free model can still answer today. */
  ready: boolean;
  /** When the next model frees up, if every model is currently cooling down. */
  retryAt?: string;
};

/**
 * User-facing assistant health.
 *
 * Deliberately carries NO model names, per-model counters, or provider details.
 * Those are developer diagnostics and live behind the secret-gated
 * `/api/admin/diagnostics` endpoint, not the normal assistant API.
 */
export async function getAssistantStatus(): Promise<AssistantStatus> {
  const rotation = await getRotationStatus();
  if (rotation.models.some((m) => m.healthy)) return { ready: true };

  const now = Date.now();
  const cooldowns = rotation.models
    .map((m) => (m.cooldownUntil ? new Date(m.cooldownUntil).getTime() : 0))
    .filter((t) => t > now);
  const retryAt = cooldowns.length
    ? new Date(Math.min(...cooldowns)).toISOString()
    : undefined;
  return { ready: false, retryAt };
}

/**
 * Strip developer diagnostics from a reply before it crosses the public API.
 * The model id and per-request counts stay on the server; a business user only
 * ever receives the answer, the plan, or a plain error.
 */
export function toPublicReply(reply: AssistantReply): AssistantReply {
  const clone = { ...(reply as unknown as Record<string, unknown>) };
  delete clone.model;
  delete clone.requestsUsed;
  return clone as unknown as AssistantReply;
}

/** Exposed for tests. */
export async function previewRoute(text: string, userId: string): Promise<RouteMatch | null> {
  const ctx = await loadRouterContext(userId);
  return route(text, ctx);
}
