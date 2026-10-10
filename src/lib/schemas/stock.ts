/**
 * Zod schemas for StockMove (stock additions, adjustments, returns).
 */

import { z } from "zod";

export const stockMoveTypeSchema = z.enum(["purchase", "adjustment", "return"]);

export const createStockMoveSchema = z
  .object({
    productId: z.string().min(1, "Product is required."),
    type: stockMoveTypeSchema,
    quantity: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === "string" ? Number(v) : v))
      .refine((v) => Number.isFinite(v) && v !== 0, "Quantity must be a non-zero number."),
    unitCost: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === "string" ? Number(v) : v))
      .refine((v) => Number.isFinite(v) && v >= 0, "Unit cost must be a non-negative number.")
      .optional()
      .nullable(),
    // V2: User-defined batch name for purchases (e.g. "Old Rice", "October Cheap Rice")
    batchName: z.string().trim().min(1, "Batch name is required for purchases.").max(100, "Batch name too long.").optional().nullable(),
    reason: z.string().trim().max(300).optional().nullable(),
    date: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      // For "purchase" and "return", quantity must be positive.
      if (data.type === "purchase" || data.type === "return") {
        return data.quantity > 0;
      }
      // For "adjustment", quantity can be signed.
      return data.quantity !== 0;
    },
    { message: "Quantity must be positive for purchase/return type. Use adjustment type for signed quantities." },
  )
  .refine(
    // For "purchase" type, unitCost is REQUIRED (each purchase batch must
    // carry its cost — without it, batch tracking has no meaning).
    // For "return" type, unitCost is optional (a customer return doesn't
    // always come with a known cost).
    // For "adjustment" type, unitCost is irrelevant (adjustments are not batches).
    (data) => {
      if (data.type === "purchase") {
        return data.unitCost !== undefined && data.unitCost !== null && data.unitCost > 0;
      }
      return true;
    },
    { message: "Unit cost is required for purchases — each batch must carry its buy price." },
  );

export type CreateStockMoveInput = z.infer<typeof createStockMoveSchema>;
