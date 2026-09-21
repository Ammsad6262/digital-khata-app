/**
 * Zod schemas for Sale + SaleItem.
 *
 * A sale is one of the most complex inputs — it's a customer + an array of
 * items + optional paidAmount + optional paymentMethod + optional date.
 */

import { z } from "zod";

export const saleItemInputSchema = z.object({
  productId: z.string().min(1, "Product is required."),
  quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0, "Quantity must be a positive number."),
  unitPrice: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v >= 0, "Unit price must be a non-negative number."),
  // ── Batch tracking ──────────────────────────────────────────────────────
  // Optional: ID of the StockMove (purchase batch) this sale line is sold from.
  // If omitted/null: sale is treated as "from opening stock" or "untracked"
  // (legacy behavior). The UI will default to the oldest available batch
  // (FIFO) and let the user pick a different one if multiple batches exist.
  batchId: z.string().min(1).optional().nullable(),
});

export const paymentMethodSchema = z.enum([
  "cash",
  "bank",
  "cheque",
  "jazzcash",
  "easypaisa",
  "other",
]);

export const createSaleSchema = z
  .object({
    customerId: z.string().min(1, "Customer is required."),
    items: z
      .array(saleItemInputSchema)
      .min(1, "Sale must contain at least one item."),
    paidAmount: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === "string" ? Number(v) : v))
      .refine((v) => Number.isFinite(v) && v >= 0, "Paid amount must be a non-negative number.")
      .default(0),
    paymentMethod: paymentMethodSchema.optional(),
    notes: z.string().trim().max(500).optional().nullable(),
    date: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      // paidAmount ≤ total — we can't compute total here easily (items have
      // stringified numbers), so we just verify paidAmount is non-negative.
      // The actual "paidAmount ≤ total" check happens in the service layer
      // after computing the total.
      return data.paidAmount >= 0;
    },
    { message: "Paid amount cannot be negative." },
  );

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;
