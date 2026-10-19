/**
 * Zod schemas for Supplier.
 *
 * Single source of truth for supplier validation — imported by both the React
 * form (client) and the API route (server) so they cannot drift apart.
 */

import { z } from "zod";
import { phoneSchema } from "./customer";

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  phone: phoneSchema,
  email: z
    .string()
    .trim()
    .max(150)
    .email("Enter a valid email address.")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  // Amount the business already owed this supplier before going digital.
  openingBalance: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v), "Opening balance must be a number.")
    .default(0),
  // Optional next follow-up date (ISO string or Date).
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
