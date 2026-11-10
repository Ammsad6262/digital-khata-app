/**
 * The confirm endpoint accepts a small patch from the confirmation card so the
 * owner can change a parsed value without re-running the model.
 *
 * This module is the single allow-list for that patch. It is deliberately a
 * plain function (no Next.js imports) so it can be unit-tested directly. The
 * action layer still re-validates every value through the normal schemas.
 */

import type { PlanPayload } from "./types";

export const ALLOWED_PATCH_KEYS: Array<keyof PlanPayload> = [
  "customerId",
  "supplierId",
  "productId",
  // Names as spoken, so a missing entity can be created on confirm.
  "customerName",
  "productName",
  "supplierName",
  "createMissing",
  "quantity",
  "unit",
  "unitPrice",
  "unitCost",
  "total",
  "paidAmount",
  "discountAmount",
  "method",
  "date",
  "dueDate",
  "name",
  "phone",
  "address",
  "openingBalance",
  "category",
  "expenseName",
  "amount",
  "notes",
  "reminderTitle",
  "reminderDueAt",
  "reminderType",
  "reminderPriority",
  "batchName",
  "purchasePrice",
  "sellingPrice",
  "openingStock",
  "sku",
  "lowStockThreshold",
  "targetId",
];

const NAME_KEYS = ["customerName", "productName", "supplierName"] as const;

/** Keep only allow-listed keys, then normalise the create/name shapes. */
export function sanitizePatch(input: unknown): Partial<PlanPayload> {
  const patch: Partial<PlanPayload> = {};
  if (!input || typeof input !== "object") return patch;

  const source = input as Record<string, unknown>;
  for (const key of ALLOWED_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      (patch as Record<string, unknown>)[key] = source[key];
    }
  }

  const raw = patch as Record<string, unknown>;

  // createMissing is a fixed 3-boolean flag, never an arbitrary object.
  if (raw.createMissing && typeof raw.createMissing === "object") {
    const flag = raw.createMissing as Record<string, unknown>;
    patch.createMissing = {
      customer: flag.customer === true,
      product: flag.product === true,
      supplier: flag.supplier === true,
    };
  } else {
    delete raw.createMissing;
  }

  // Names are bounded, trimmed strings or nothing.
  for (const nameKey of NAME_KEYS) {
    const value = raw[nameKey];
    if (typeof value === "string" && value.trim()) {
      raw[nameKey] = value.trim().slice(0, 120);
    } else {
      delete raw[nameKey];
    }
  }

  return patch;
}
