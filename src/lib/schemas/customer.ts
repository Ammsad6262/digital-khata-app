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
//
// The empty string is normalised to null BEFORE validation. This matters: a
// plain `.min(7)` runs on the string itself, so the form's default "" would
// fail with "must be at least 7 digits" and the owner could never save a
// customer without a phone number — even though the field is labelled
// optional. `.optional()` only permits `undefined`, not `""`.
const validPhone = z
  .string()
  .trim()
  .min(7, "Phone must be at least 7 digits.")
  .max(20, "Phone must be at most 20 characters.")
  .regex(/^[0-9+\-\s]+$/, "Phone can only contain digits, +, -, and spaces.");

export const phoneSchema = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
    z.union([validPhone, z.null(), z.undefined()]),
  )
  .transform((value) => (value === undefined || value === null ? null : value));

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
