/**
 * Zod schemas for Purchase (stock bought from a supplier).
 *
 * Shared by the API route and the client form so validation cannot drift.
 * Money/quantity values arrive as number or string (HTML inputs give strings)
 * and are normalised to JS numbers here; the service converts to Decimal.
 */

import { z } from "zod";

const decimalish = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v.trim()) : v))
    .refine((v) => Number.isFinite(v), `${label} must be a number.`);

export const purchaseItemSchema = z.object({
  productId: z.string().min(1, "Pick a product."),
  quantity: decimalish("Quantity").refine((v) => v > 0, "Quantity must be greater than 0."),
  unitCost: decimalish("Unit cost").refine((v) => v >= 0, "Unit cost cannot be negative."),
  // Optional user-defined batch name (e.g. "Old Rice").
  batchName: z.string().trim().max(100).optional().nullable(),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, "Pick a supplier."),
  items: z.array(purchaseItemSchema).min(1, "Add at least one item.").max(100),
  // Money paid to the supplier at purchase time (0 = fully on credit).
  paidAmount: decimalish("Paid amount")
    .refine((v) => v >= 0, "Paid amount cannot be negative.")
    .default(0),
  notes: z.string().trim().max(500).optional().nullable(),
  // Backdating allowed.
  date: z.coerce.date().optional(),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;
