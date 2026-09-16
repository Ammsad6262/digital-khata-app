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
  );

export type CreateStockMoveInput = z.infer<typeof createStockMoveSchema>;
