/**
 * Zod schemas for Payment.
 */

import { z } from "zod";
import { paymentMethodSchema } from "./sale";

export const createPaymentSchema = z.object({
  customerId: z.string().min(1, "Customer is required."),
  saleId: z.string().optional().nullable(),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0, "Payment amount must be a positive number."),
  method: paymentMethodSchema,
  notes: z.string().trim().max(500).optional().nullable(),
  date: z.string().datetime().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
