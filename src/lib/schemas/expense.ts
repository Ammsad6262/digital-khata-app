/**
 * Zod schemas for Expense.
 */

import { z } from "zod";

export const expenseCategorySchema = z.enum([
  "transport",
  "shop",
  "electricity",
  "packaging",
  "salary",
  "rent",
  "other",
]);

export const createExpenseSchema = z.object({
  name: z.string().trim().min(1, "Expense name is required.").max(200),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0, "Expense amount must be a positive number."),
  category: expenseCategorySchema,
  notes: z.string().trim().max(500).optional().nullable(),
  date: z.string().datetime().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
