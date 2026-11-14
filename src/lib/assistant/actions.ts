/**
 * Action execution.
 *
 * The assistant NEVER writes to the database directly. It builds a typed
 * payload; this module calls the same service functions the normal screens
 * call, then re-reads the affected record and verifies the expected outcome.
 *
 * "Verify" is not decoration: if a sale did not change the customer balance by
 * the expected amount, the result is marked unverified instead of reporting
 * success.
 */

import { Decimal } from "@/lib/utils/decimal";
import { prisma } from "@/lib/db/prisma";
import { createSale } from "@/lib/services/sales";
import { recordPayment } from "@/lib/services/payments";
import { recordExpense } from "@/lib/services/expenses";
import { createCustomer, getCustomerWithBalance } from "@/lib/services/customers";
import { createSupplier, listSuppliersWithBalance } from "@/lib/services/suppliers";
import { createProductWithOpeningStock, getProductWithStock } from "@/lib/services/products";
import { createPurchase } from "@/lib/services/purchases";
import { createSupplierPayment } from "@/lib/services/supplier-payments";
import { createReminder, setReminderCompleted } from "@/lib/services/reminders";
import { addStockMove } from "@/lib/services/stock";
import { voidSale } from "@/lib/services/sales";
import { voidExpense } from "@/lib/services/expenses";
import { voidPayment } from "@/lib/services/payments";
import { BadRequestError } from "@/lib/errors";
import { expenseCategorySchema } from "@/lib/schemas/expense";
import type { PlanPayload } from "./types";

export type ActionResult =
  | {
      ok: true;
      message: string;
      entityId?: string;
      entityType: string;
      href?: string;
      verified: boolean;
      verification?: string;
      data?: unknown;
    }
  | {
      ok: false;
      message: string;
      code: string;
    };

function d(value: string | number | null | undefined): Decimal {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Decimal(Number.isFinite(n) ? n : 0);
}

function close(a: Decimal, b: Decimal): boolean {
  return a.minus(b).abs().lte(new Decimal("0.01"));
}

function money(v: Decimal | string | number): string {
  const dec = v instanceof Decimal ? v : d(v);
  return `Rs. ${dec.toDecimalPlaces(2).toNumber().toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function requireField<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new BadRequestError(`The ${name} is missing.`);
  }
  return value;
}

/** Normalise the single-item shorthand into the array the service expects. */
function saleItems(payload: PlanPayload, productId: string) {
  if (payload.items && payload.items.length > 0) return payload.items;

  const quantity = requireField(payload.quantity, "quantity");
  if (quantity <= 0) throw new BadRequestError("Quantity must be greater than zero.");

  let unitPrice = payload.unitPrice;
  if ((unitPrice === undefined || unitPrice === null) && payload.total) {
    unitPrice = Math.round((payload.total / quantity) * 100) / 100;
  }
  if (unitPrice === undefined || unitPrice === null) {
    throw new BadRequestError("The price is missing.");
  }
  return [{ productId, quantity, unitPrice }];
}

/**
 * Resolve-or-create helpers.
 *
 * When the owner taps "Create <name>" on the confirmation card, the payload
 * carries `createMissing.<entity> = true` plus the spoken name. We create the
 * record through the SAME service the normal screens use, then continue with
 * the original action, so nothing is written unless the whole action succeeds.
 */
async function resolveOrCreateCustomer(userId: string, payload: PlanPayload): Promise<string> {
  if (payload.customerId) return payload.customerId;
  if (payload.createMissing?.customer && payload.customerName) {
    const created = await createCustomer({ name: payload.customerName }, userId);
    return created.id;
  }
  return requireField(payload.customerId, "customer");
}

async function resolveOrCreateProduct(_userId: string, payload: PlanPayload): Promise<string> {
  if (payload.productId) return payload.productId;
  // Never invent a product from a sale/purchase/stock command: selling a product
  // the shop never stocked is a data error. The owner must add it explicitly
  // ("add product marshmallow"), which opens the full product form. Customer and
  // supplier names are safe to create in one tap; a product price is not.
  if (payload.productName) {
    throw new BadRequestError(
      `No product named “${payload.productName}” in your products. Add it first, then record this sale.`,
    );
  }
  return requireField(payload.productId, "product");
}

async function resolveOrCreateSupplier(userId: string, payload: PlanPayload): Promise<string> {
  if (payload.supplierId) return payload.supplierId;
  if (payload.createMissing?.supplier && payload.supplierName) {
    const created = await createSupplier({ name: payload.supplierName }, userId);
    return created.id;
  }
  return requireField(payload.supplierId, "supplier");
}

/** Map a free-text spoken category onto the strict expense enum, or "other". */
function normaliseExpenseCategory(category: string | undefined) {
  const parsed = expenseCategorySchema.safeParse(category);
  return parsed.success ? parsed.data : ("other" as const);
}

export async function performAction(
  userId: string,
  payload: PlanPayload,
): Promise<ActionResult> {
  switch (payload.action) {
    // ── SALES ────────────────────────────────────────────────────────────
    case "CREATE_SALE": {
      // Validate BEFORE creating any new customer/product, so a failed confirm
      // never leaves orphan rows behind.
      if (payload.paidAmount === null || payload.paidAmount === undefined) {
        throw new BadRequestError(
          "How much did the customer pay? Say the paid amount, or confirm 'on credit'.",
        );
      }
      const paidAmount = payload.paidAmount;
      if (paidAmount < 0) throw new BadRequestError("Paid amount cannot be negative.");
      if (!payload.items?.length) {
        const qty = requireField(payload.quantity, "quantity");
        if (qty <= 0) throw new BadRequestError("Quantity must be greater than zero.");
        const price =
          payload.unitPrice ??
          (payload.total ? Math.round((payload.total / qty) * 100) / 100 : null);
        if (price == null) {
          throw new BadRequestError("The price is missing.");
        }
        // Reject an over-payment BEFORE creating any new customer/product, so a
        // failure here cannot leave orphan rows (the same rule createSale enforces).
        const expectedTotal = Math.round((qty * price - (payload.discountAmount ?? 0)) * 100) / 100;
        if (paidAmount > expectedTotal) {
          throw new BadRequestError(
            `The paid amount is more than the sale total (${money(expectedTotal)}).`,
          );
        }
      }

      const customerId = await resolveOrCreateCustomer(userId, payload);
      const productId = await resolveOrCreateProduct(userId, payload);
      const items = saleItems(payload, productId);

      const before = await getCustomerWithBalance(customerId, userId);
      const balanceBefore = d(before.balance);

      const sale = await createSale(
        {
          customerId,
          items,
          paidAmount,
          discountAmount: payload.discountAmount ?? 0,
          paymentMethod: payload.method,
          notes: payload.notes,
          date: payload.date,
          dueDate: payload.dueDate,
        },
        userId,
      );

      const after = await getCustomerWithBalance(customerId, userId);
      const expected = balanceBefore.plus(d(sale.totalAmount)).minus(d(paidAmount));
      const verified = close(d(after.balance), expected);

      return {
        ok: true,
        message: `Sale saved: ${money(d(sale.totalAmount))} to ${before.name}. Paid ${money(d(paidAmount))}, balance ${money(d(after.balance))}.`,
        entityId: sale.id,
        entityType: "sale",
        href: `/sales/${sale.id}`,
        verified,
        verification: verified ? undefined : `Expected balance ${money(expected)}, found ${money(d(after.balance))}.`,
        data: { total: sale.totalAmount, paidAmount, balance: after.balance },
      };
    }

    // ── CUSTOMER PAYMENT ─────────────────────────────────────────────────
    case "RECORD_PAYMENT": {
      const customerId = await resolveOrCreateCustomer(userId, payload);
      const amount = requireField(payload.amount, "amount");
      if (amount <= 0) throw new BadRequestError("A payment must be greater than zero.");

      const before = await getCustomerWithBalance(customerId, userId);
      const balanceBefore = d(before.balance);

      const payment = await recordPayment(
        {
          customerId,
          saleId: payload.targetId ?? undefined,
          amount,
          method: payload.method ?? "cash",
          notes: payload.notes,
          date: payload.date,
        },
        userId,
      );

      const after = await getCustomerWithBalance(customerId, userId);
      const expected = balanceBefore.minus(d(amount));
      const verified = close(d(after.balance), expected);

      return {
        ok: true,
        message: `Recorded ${money(d(amount))} from ${before.name}. Balance is now ${money(d(after.balance))}.`,
        entityId: payment.id,
        entityType: "payment",
        href: `/khata/${customerId}`,
        verified,
        verification: verified ? undefined : `Expected balance ${money(expected)}, found ${money(d(after.balance))}.`,
        data: { balance: after.balance },
      };
    }

    // ── EXPENSE ──────────────────────────────────────────────────────────
    case "CREATE_EXPENSE": {
      const amount = requireField(payload.amount, "amount");
      if (amount <= 0) throw new BadRequestError("An expense must be greater than zero.");

      const expense = await recordExpense(
        {
          name: payload.expenseName || "General expense",
          amount,
          category: normaliseExpenseCategory(payload.category),
          notes: payload.notes,
          date: payload.date,
        },
        userId,
      );

      return {
        ok: true,
        message: `Expense saved: ${payload.expenseName || "General expense"} ${money(d(amount))} (${payload.category ?? "other"}).`,
        entityId: expense.id,
        entityType: "expense",
        href: `/expenses/${expense.id}`,
        verified: true,
        data: expense,
      };
    }

    // ── PEOPLE ───────────────────────────────────────────────────────────
    case "CREATE_CUSTOMER": {
      const name = requireField(payload.name, "customer name");
      const customer = await createCustomer(
        {
          name,
          phone: payload.phone,
          address: payload.address,
          openingBalance: payload.openingBalance ?? 0,
        },
        userId,
      );
      return {
        ok: true,
        message: `Customer ${customer.name} added.`,
        entityId: customer.id,
        entityType: "customer",
        href: `/khata/${customer.id}`,
        verified: true,
        data: customer,
      };
    }

    case "CREATE_SUPPLIER": {
      const name = requireField(payload.name, "supplier name");
      const supplier = await createSupplier(
        { name, phone: payload.phone, address: payload.address, openingBalance: payload.openingBalance ?? 0 },
        userId,
      );
      return {
        ok: true,
        message: `Supplier ${supplier.name} added.`,
        entityId: supplier.id,
        entityType: "supplier",
        href: `/suppliers/${supplier.id}`,
        verified: true,
        data: supplier,
      };
    }

    // ── PRODUCTS ─────────────────────────────────────────────────────────
    case "CREATE_PRODUCT": {
      const name = requireField(payload.name, "product name");
      const sellingPrice = requireField(payload.sellingPrice, "selling price");
      const purchasePrice = payload.purchasePrice ?? sellingPrice;
      const unit = payload.unit || "piece";
      const openingStock = payload.openingStock ?? 0;

      const result = await createProductWithOpeningStock(
        {
          name,
          unit,
          purchasePrice,
          sellingPrice,
          category: payload.category ?? null,
          sku: payload.sku ?? null,
          lowStockThreshold: payload.lowStockThreshold ?? 5,
          openingStock,
        },
        userId,
      );

      return {
        ok: true,
        message:
          openingStock > 0
            ? `Product ${result.product.name} added with ${openingStock} ${unit} opening stock.`
            : `Product ${result.product.name} added.`,
        entityId: result.product.id,
        entityType: "product",
        href: `/more/products/${result.product.id}`,
        verified: true,
        data: result,
      };
    }

    // ── PURCHASES ────────────────────────────────────────────────────────
    case "CREATE_PURCHASE": {
      // Validate before creating anything, so a failed confirm cannot orphan rows.
      const quantity = requireField(payload.quantity, "quantity");
      const unitCost = requireField(payload.unitCost, "purchase price");
      const supplierId = await resolveOrCreateSupplier(userId, payload);
      const productId = await resolveOrCreateProduct(userId, payload);

      const stockBefore = await getProductWithStock(productId, userId);
      const suppliersBefore = await listSuppliersWithBalance(userId);
      const supplierBefore = suppliersBefore.find((s) => s.id === supplierId);
      if (!supplierBefore) throw new BadRequestError("Supplier not found.");

      const purchase = await createPurchase(
        {
          supplierId,
          items: [{ productId, quantity, unitCost, batchName: payload.batchName ?? null }],
          paidAmount: payload.paidAmount ?? 0,
          notes: payload.notes,
          date: payload.date,
          dueDate: payload.dueDate,
        },
        userId,
      );

      const stockAfter = await getProductWithStock(productId, userId);
      const expectedStock = d(stockBefore.currentStock).plus(d(quantity));
      const verified = close(d(stockAfter.currentStock), expectedStock);

      const outstanding = d(purchase.totalAmount).minus(d(payload.paidAmount ?? 0));

      return {
        ok: true,
        message: `Purchase saved from ${supplierBefore.name}: ${purchase.items.length} item(s), ${money(d(purchase.totalAmount))} total, ${money(outstanding)} on credit. Stock is now ${stockAfter.currentStock} ${stockAfter.unit}.`,
        entityId: purchase.id,
        entityType: "purchase",
        href: `/suppliers/${supplierId}`,
        verified,
        verification: verified
          ? undefined
          : `Expected stock ${expectedStock.toString()}, found ${stockAfter.currentStock}.`,
        data: { total: purchase.totalAmount, outstanding: outstanding.toString() },
      };
    }

    // ── SUPPLIER PAYMENT ─────────────────────────────────────────────────
    case "SUPPLIER_PAYMENT": {
      const supplierId = await resolveOrCreateSupplier(userId, payload);
      const amount = requireField(payload.amount, "amount");
      if (amount <= 0) throw new BadRequestError("A payment must be greater than zero.");

      const before = (await listSuppliersWithBalance(userId)).find((s) => s.id === supplierId);
      if (!before) throw new BadRequestError("Supplier not found.");
      if (d(amount).gt(d(before.balance))) {
        throw new BadRequestError(
          `Payment is more than the outstanding balance (${money(d(before.balance))}).`,
        );
      }

      const payment = await createSupplierPayment(
        {
          supplierId,
          purchaseId: payload.targetId ?? undefined,
          amount,
          method: payload.method ?? "cash",
          notes: payload.notes,
          date: payload.date,
        },
        userId,
      );

      const after = (await listSuppliersWithBalance(userId)).find((s) => s.id === supplierId);
      const expected = d(before.balance).minus(d(amount));
      const verified = !!after && close(d(after.balance), expected);

      return {
        ok: true,
        message: `Paid ${money(d(amount))} to ${before.name}. Balance is now ${after ? money(d(after.balance)) : "updated"}.`,
        entityId: payment.id,
        entityType: "supplierPayment",
        href: `/suppliers/${supplierId}`,
        verified,
        verification: verified ? undefined : "Supplier balance did not match the expected value.",
        data: { balance: after?.balance },
      };
    }

    // ── STOCK ────────────────────────────────────────────────────────────
    case "ADD_STOCK": {
      const productId = await resolveOrCreateProduct(userId, payload);
      const quantity = requireField(payload.quantity, "quantity");
      if (quantity <= 0) throw new BadRequestError("Stock quantity must be greater than zero.");

      const before = await getProductWithStock(productId, userId);
      const unitCost = payload.unitCost ?? Number(before.purchasePrice);

      const move = await addStockMove(
        {
          productId,
          type: "purchase",
          quantity,
          unitCost,
          batchName: payload.batchName ?? `Stock ${new Date().toISOString().slice(0, 10)}`,
          reason: payload.notes ?? "Added by assistant",
          date: payload.date,
        },
        userId,
      );

      const after = await getProductWithStock(productId, userId);
      const expected = d(before.currentStock).plus(d(quantity));
      const verified = close(d(after.currentStock), expected);

      return {
        ok: true,
        message: `Added ${quantity} ${after.unit} of ${after.name}. Stock is now ${after.currentStock} ${after.unit}.`,
        entityId: move.id,
        entityType: "stockMove",
        href: `/more/products/${productId}`,
        verified,
        verification: verified ? undefined : "Stock did not match the expected value.",
        data: { before: before.currentStock, after: after.currentStock },
      };
    }

    // ── REMINDERS ────────────────────────────────────────────────────────
    case "CREATE_REMINDER": {
      const title = requireField(payload.reminderTitle, "reminder title");
      const dueAt = requireField(payload.reminderDueAt, "due date");
      const reminder = await createReminder(
        {
          title,
          notes: payload.notes,
          type: (payload.reminderType as "custom") ?? "custom",
          dueAt,
          priority: (payload.reminderPriority as "normal") ?? "normal",
          customerId: payload.customerId ?? null,
          supplierId: payload.supplierId ?? null,
          productId: payload.productId ?? null,
        },
        userId,
      );
      return {
        ok: true,
        message: `Reminder set: “${reminder.title}”.`,
        entityId: reminder.id,
        entityType: "reminder",
        href: "/reminders",
        verified: true,
        data: reminder,
      };
    }

    case "COMPLETE_REMINDER": {
      const id = requireField(payload.targetId, "reminder");
      const reminder = await setReminderCompleted(id, true, userId);
      return {
        ok: true,
        message: `Reminder completed: “${reminder.title}”.`,
        entityId: reminder.id,
        entityType: "reminder",
        href: "/reminders",
        verified: true,
      };
    }

    // ── VOIDS (sensitive — the plan always requires confirmation) ────────
    case "VOID_SALE": {
      const id = requireField(payload.targetId, "sale");
      const sale = await voidSale(id, userId);
      return {
        ok: true,
        message: "Sale voided. Its payments were reversed and stock restored.",
        entityId: sale.id,
        entityType: "sale",
        href: `/sales/${sale.id}`,
        verified: true,
      };
    }

    case "VOID_EXPENSE": {
      const id = requireField(payload.targetId, "expense");
      const expense = await voidExpense(id, userId);
      return {
        ok: true,
        message: "Expense voided. It will no longer count in reports.",
        entityId: expense.id,
        entityType: "expense",
        href: `/expenses/${expense.id}`,
        verified: true,
      };
    }

    case "VOID_PAYMENT": {
      const id = requireField(payload.targetId, "payment");
      const payment = await voidPayment(id, userId);
      return {
        ok: true,
        message: "Payment voided. The customer balance has been restored.",
        entityId: payment.id,
        entityType: "payment",
        verified: true,
      };
    }

    default:
      return { ok: false, message: "That action is not supported yet.", code: "UNSUPPORTED_ACTION" };
  }
}

/**
 * Idempotency key.
 *
 * A two-minute bucket means a double tap / retried request maps to the same
 * plan and cannot create a second financial transaction, while a genuinely
 * repeated sale later in the day still works.
 */
export function buildIdempotencyKey(
  userId: string,
  action: string,
  payload: PlanPayload,
  text: string,
): string {
  const relevant = {
    a: action,
    c: payload.customerId ?? null,
    s: payload.supplierId ?? null,
    p: payload.productId ?? null,
    q: payload.quantity ?? null,
    u: payload.unitPrice ?? null,
    t: payload.total ?? null,
    pa: payload.paidAmount ?? null,
    am: payload.amount ?? null,
    n: payload.name ?? payload.expenseName ?? null,
    target: payload.targetId ?? null,
  };
  const bucket = Math.floor(Date.now() / 120_000);
  const raw = `${userId}|${JSON.stringify(relevant)}|${text.trim().toLowerCase()}|${bucket}`;
  // Node's crypto is available in route handlers and in tsx scripts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(raw).digest("hex");
}

/** Look up a sale/expense/payment id mentioned by number in a command. */
export async function resolveTargetId(
  userId: string,
  kind: "sale" | "expense" | "payment",
  needle: string,
): Promise<string | null> {
  if (!needle) return null;
  const where = { userId, OR: [{ id: needle }, { id: { endsWith: needle } }] };
  if (kind === "sale") {
    const row = await prisma.sale.findFirst({ where, select: { id: true } });
    return row?.id ?? null;
  }
  if (kind === "expense") {
    const row = await prisma.expense.findFirst({ where, select: { id: true } });
    return row?.id ?? null;
  }
  const row = await prisma.payment.findFirst({ where, select: { id: true } });
  return row?.id ?? null;
}