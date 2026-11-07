/**
 * Zod schemas for Customer.
 *
 * These are the SINGLE SOURCE OF TRUTH for customer validation — imported
 * by both the React form (client) and the API route (server) so they
 * cannot drift apart.
 */

import { z } from "zod";

// Phone is OPTIONAL. When provided, it must be a valid phone-like string.
// Empty string / whitespace → null (stored as NULL in Postgres).
export const phoneSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  // Treat an empty / whitespace-only field as "no phone" BEFORE the length and
  // format checks, so the field labelled optional really is optional.
  .transform((v) => (v === null || v === undefined || v.length === 0 ? null : v))
  .pipe(
    z
      .string()
      .min(7, "Phone must be at least 7 digits.")
      .max(20, "Phone must be at most 20 characters.")
      .regex(/^[0-9+\-\s]+$/, "Phone can only contain digits, +, -, and spaces.")
      .nullable(),
  );

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  companyName: z.string().trim().max(150).optional().nullable(),
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
