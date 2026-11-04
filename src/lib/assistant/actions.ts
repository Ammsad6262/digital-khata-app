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
import {
  categoryLabel,
  pickVoice,
  unitLabel,
  type VoiceLang,
  type VoicePhraseKey,
} from "./phrases";
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

/** Urdu names for the fields the validation errors mention. */
const FIELD_NAMES_UR: Record<string, string> = {
  quantity: "مقدار",
  product: "مصنوع",
  price: "قیمت",
  customer: "گاہک",
  amount: "رقم",
  "customer name": "گاہک کا نام",
  "supplier name": "سپلائر کا نام",
  "product name": "مصنوع کا نام",
  "selling price": "فروخت کی قیمت",
  supplier: "سپلائر",
  "purchase price": "خریداری کی قیمت",
  "reminder title": "یاد دہانی کا عنوان",
  "due date": "واجب تاریخ",
  reminder: "یاد دہانی",
  sale: "فروخت",
  expense: "خرچ",
  payment: "ادائیگی",
};

function requireField<T>(
  value: T | null | undefined,
  name: string,
  lang: VoiceLang,
): T {
  if (value === null || value === undefined) {
    throw new BadRequestError(
      pickVoice(lang, "missingField", {
        field: lang === "ur" ? (FIELD_NAMES_UR[name] ?? name) : name,
      }),
    );
  }
  return value;
}

/** Normalise the single-item shorthand into the array the service expects. */
function saleItems(payload: PlanPayload, lang: VoiceLang) {
  if (payload.items && payload.items.length > 0) return payload.items;

  const quantity = requireField(payload.quantity, "quantity", lang);
  if (quantity <= 0) throw new BadRequestError(pickVoice(lang, "errQuantityPositive"));

  let unitPrice = payload.unitPrice;
  if ((unitPrice === undefined || unitPrice === null) && payload.total) {
    unitPrice = Math.round((payload.total / quantity) * 100) / 100;
  }
  if (unitPrice === undefined || unitPrice === null) {
    throw new BadRequestError(pickVoice(lang, "errPriceMissing"));
  }
  return [
    {
      productId: requireField(payload.productId, "product", lang),
      quantity,
      unitPrice,
    },
  ];
}

export async function performAction(
  userId: string,
  payload: PlanPayload,
  lang: VoiceLang = "en",
): Promise<ActionResult> {
  const v = (key: VoicePhraseKey, params?: Record<string, string | number>) =>
    pickVoice(lang, key, params);

  switch (payload.action) {
    // ── SALES ────────────────────────────────────────────────────────────
    case "CREATE_SALE": {
      const customerId = requireField(payload.customerId, "customer", lang);
      const items = saleItems(payload, lang);

      const before = await getCustomerWithBalance(customerId, userId);
      const balanceBefore = d(before.balance);

      if (payload.paidAmount === null || payload.paidAmount === undefined) {
        throw new BadRequestError(v("errPaidAmountRequired"));
      }
      const paidAmount = payload.paidAmount;
      if (paidAmount < 0) throw new BadRequestError(v("errPaidNegative"));

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
        message: v("actionSaleSaved", {
          total: money(d(sale.totalAmount)),
          name: before.name,
          paid: money(d(paidAmount)),
          balance: money(d(after.balance)),
        }),
        entityId: sale.id,
        entityType: "sale",
        href: `/sales/${sale.id}`,
        verified,
        verification: verified
          ? undefined
          : v("actionExpectedBalance", {
              expected: money(expected),
              actual: money(d(after.balance)),
            }),
        data: { total: sale.totalAmount, paidAmount, balance: after.balance },
      };
    }

    // ── CUSTOMER PAYMENT ─────────────────────────────────────────────────
    case "RECORD_PAYMENT": {
      const customerId = requireField(payload.customerId, "customer", lang);
      const amount = requireField(payload.amount, "amount", lang);
      if (amount <= 0) throw new BadRequestError(v("errPaymentPositive"));

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
        message: v("actionPaymentRecorded", {
          amount: money(d(amount)),
          name: before.name,
          balance: money(d(after.balance)),
        }),
        entityId: payment.id,
        entityType: "payment",
        href: `/khata/${customerId}`,
        verified,
        verification: verified
          ? undefined
          : v("actionExpectedBalance", {
              expected: money(expected),
              actual: money(d(after.balance)),
            }),
        data: { balance: after.balance },
      };
    }

    // ── EXPENSE ──────────────────────────────────────────────────────────
    case "CREATE_EXPENSE": {
      const amount = requireField(payload.amount, "amount", lang);
      if (amount <= 0) throw new BadRequestError(v("errExpensePositive"));
      const expenseName = payload.expenseName || v("generalExpense");

      const expense = await recordExpense(
        {
          name: expenseName,
          amount,
          category: payload.category ?? "other",
          notes: payload.notes,
          date: payload.date,
        },
        userId,
      );

      return {
        ok: true,
        message: v("actionExpenseSaved", {
          name: expenseName,
          amount: money(d(amount)),
          category: categoryLabel(lang, payload.category ?? "other"),
        }),
        entityId: expense.id,
        entityType: "expense",
        href: `/expenses/${expense.id}`,
        verified: true,
        data: expense,
      };
    }

    // ── PEOPLE ───────────────────────────────────────────────────────────
    case "CREATE_CUSTOMER": {
      const name = requireField(payload.name, "customer name", lang);
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
        message: v("actionCustomerAdded", { name: customer.name }),
        entityId: customer.id,
        entityType: "customer",
        href: `/khata/${customer.id}`,
        verified: true,
        data: customer,
      };
    }

    case "CREATE_SUPPLIER": {
      const name = requireField(payload.name, "supplier name", lang);
      const supplier = await createSupplier(
        { name, phone: payload.phone, address: payload.address, openingBalance: payload.openingBalance ?? 0 },
        userId,
      );
      return {
        ok: true,
        message: v("actionSupplierAdded", { name: supplier.name }),
        entityId: supplier.id,
        entityType: "supplier",
        href: `/suppliers/${supplier.id}`,
        verified: true,
        data: supplier,
      };
    }

    // ── PRODUCTS ─────────────────────────────────────────────────────────
    case "CREATE_PRODUCT": {
      const name = requireField(payload.name, "product name", lang);
      const sellingPrice = requireField(payload.sellingPrice, "selling price", lang);
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
            ? v("actionProductAddedStock", {
                name: result.product.name,
                stock: openingStock,
                unit: unitLabel(lang, unit),
              })
            : v("actionProductAdded", { name: result.product.name }),
        entityId: result.product.id,
        entityType: "product",
        href: `/more/products/${result.product.id}`,
        verified: true,
        data: result,
      };
    }

    // ── PURCHASES ────────────────────────────────────────────────────────
    case "CREATE_PURCHASE": {
      const supplierId = requireField(payload.supplierId, "supplier", lang);
      const quantity = requireField(payload.quantity, "quantity", lang);
      const unitCost = requireField(payload.unitCost, "purchase price", lang);
      const productId = requireField(payload.productId, "product", lang);

      const stockBefore = await getProductWithStock(productId, userId);
      const suppliersBefore = await listSuppliersWithBalance(userId);
      const supplierBefore = suppliersBefore.find((s) => s.id === supplierId);
      if (!supplierBefore) throw new BadRequestError(v("errSupplierNotFound"));

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
        message: v("actionPurchaseSaved", {
          supplier: supplierBefore.name,
          items: purchase.items.length,
          total: money(d(purchase.totalAmount)),
          outstanding: money(outstanding),
          stock: stockAfter.currentStock,
          unit: unitLabel(lang, stockAfter.unit),
        }),
        entityId: purchase.id,
        entityType: "purchase",
        href: `/suppliers/${supplierId}`,
        verified,
        verification: verified
          ? undefined
          : v("actionExpectedStock", {
              expected: expectedStock.toString(),
              actual: stockAfter.currentStock,
            }),
        data: { total: purchase.totalAmount, outstanding: outstanding.toString() },
      };
    }

    // ── SUPPLIER PAYMENT ─────────────────────────────────────────────────
    case "SUPPLIER_PAYMENT": {
      const supplierId = requireField(payload.supplierId, "supplier", lang);
      const amount = requireField(payload.amount, "amount", lang);
      if (amount <= 0) throw new BadRequestError(v("errPaymentPositive"));

      const before = (await listSuppliersWithBalance(userId)).find((s) => s.id === supplierId);
      if (!before) throw new BadRequestError(v("errSupplierNotFound"));
      if (d(amount).gt(d(before.balance))) {
        throw new BadRequestError(
          v("errPaymentOverBalance", { amount: money(d(before.balance)) }),
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
        message: v("actionSupplierPaid", {
          amount: money(d(amount)),
          name: before.name,
          balance: after ? money(d(after.balance)) : v("actionUpdated"),
        }),
        entityId: payment.id,
        entityType: "supplierPayment",
        href: `/suppliers/${supplierId}`,
        verified,
        verification: verified ? undefined : v("errSupplierBalanceMismatch"),
        data: { balance: after?.balance },
      };
    }

    // ── STOCK ────────────────────────────────────────────────────────────
    case "ADD_STOCK": {
      const productId = requireField(payload.productId, "product", lang);
      const quantity = requireField(payload.quantity, "quantity", lang);
      if (quantity <= 0) throw new BadRequestError(v("errStockPositive"));

      const before = await getProductWithStock(productId, userId);
      const unitCost = payload.unitCost ?? Number(before.purchasePrice);

      const move = await addStockMove(
        {
          productId,
          type: "purchase",
          quantity,
          unitCost,
          batchName: payload.batchName ?? `Stock ${new Date().toISOString().slice(0, 10)}`,
          reason: payload.notes ?? v("addedByAssistant"),
          date: payload.date,
        },
        userId,
      );

      const after = await getProductWithStock(productId, userId);
      const expected = d(before.currentStock).plus(d(quantity));
      const verified = close(d(after.currentStock), expected);

      return {
        ok: true,
        message: v("actionStockAdded", {
          quantity,
          unit: unitLabel(lang, after.unit),
          name: after.name,
          stock: after.currentStock,
        }),
        entityId: move.id,
        entityType: "stockMove",
        href: `/more/products/${productId}`,
        verified,
        verification: verified ? undefined : v("errStockMismatch"),
        data: { before: before.currentStock, after: after.currentStock },
      };
    }

    // ── REMINDERS ────────────────────────────────────────────────────────
    case "CREATE_REMINDER": {
      const title = requireField(payload.reminderTitle, "reminder title", lang);
      const dueAt = requireField(payload.reminderDueAt, "due date", lang);
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
        message: v("actionReminderSet", { title: reminder.title }),
        entityId: reminder.id,
        entityType: "reminder",
        href: "/reminders",
        verified: true,
        data: reminder,
      };
    }

    case "COMPLETE_REMINDER": {
      const id = requireField(payload.targetId, "reminder", lang);
      const reminder = await setReminderCompleted(id, true, userId);
      return {
        ok: true,
        message: v("actionReminderCompleted", { title: reminder.title }),
        entityId: reminder.id,
        entityType: "reminder",
        href: "/reminders",
        verified: true,
      };
    }

    // ── VOIDS (sensitive — the plan always requires confirmation) ────────
    case "VOID_SALE": {
      const id = requireField(payload.targetId, "sale", lang);
      const sale = await voidSale(id, userId);
      return {
        ok: true,
        message: v("actionSaleVoided"),
        entityId: sale.id,
        entityType: "sale",
        href: `/sales/${sale.id}`,
        verified: true,
      };
    }

    case "VOID_EXPENSE": {
      const id = requireField(payload.targetId, "expense", lang);
      const expense = await voidExpense(id, userId);
      return {
        ok: true,
        message: v("actionExpenseVoided"),
        entityId: expense.id,
        entityType: "expense",
        href: `/expenses/${expense.id}`,
        verified: true,
      };
    }

    case "VOID_PAYMENT": {
      const id = requireField(payload.targetId, "payment", lang);
      const payment = await voidPayment(id, userId);
      return {
        ok: true,
        message: v("actionPaymentVoided"),
        entityId: payment.id,
        entityType: "payment",
        verified: true,
      };
    }

    default:
      return { ok: false, message: v("errUnsupportedAction"), code: "UNSUPPORTED_ACTION" };
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