/**
 * Zod schemas for Customer.
 *
 * These are the SINGLE SOURCE OF TRUTH for customer validation — imported
 * by both the React form (client) and the API route (server) so they
 * cannot drift apart.
 */

import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Phone must be at least 7 digits.")
  .max(20, "Phone must be at most 20 characters.")
  .regex(/^[0-9+\-\s]+$/, "Phone can only contain digits, +, -, and spaces.");

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  phone: phoneSchema,
  address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  openingBalance: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v), "Opening balance must be a number.")
    .default(0),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
