/**
 * Zod schemas for CustomerAdjustment (manual balance correction).
 */

import { z } from "zod";

export const createAdjustmentSchema = z.object({
  customerId: z.string().min(1, "Customer is required."),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v !== 0, "Adjustment amount must be non-zero."),
  reason: z.string().trim().min(1, "Reason is required.").max(300),
  notes: z.string().trim().max(500).optional().nullable(),
  date: z.string().datetime().optional(),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
