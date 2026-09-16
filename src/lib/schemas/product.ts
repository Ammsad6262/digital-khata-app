/**
 * Zod schemas for Product.
 */

import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  category: z.string().trim().max(50).optional().nullable(),
  purchasePrice: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v >= 0, "Purchase price must be a non-negative number."),
  sellingPrice: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v >= 0, "Selling price must be a non-negative number."),
  unit: z.string().trim().min(1, "Unit is required.").max(20).default("piece"),
  sku: z.string().trim().max(50).optional().nullable(),
  openingStock: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v >= 0, "Opening stock must be a non-negative number.")
    .default(0),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).default(5),
});

export const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
