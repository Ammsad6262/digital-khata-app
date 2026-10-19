/**
 * Zod schemas for SupplierPayment (money PAID to a supplier).
 */

import { z } from "zod";

const decimalish = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v.trim()) : v))
    .refine((v) => Number.isFinite(v), `${label} must be a number.`);

export const SUPPLIER_PAYMENT_METHODS = [
  "cash",
  "bank",
  "cheque",
  "jazzcash",
  "easypaisa",
  "other",
] as const;

export const createSupplierPaymentSchema = z.object({
  supplierId: z.string().min(1, "Pick a supplier."),
  // Optional link to a specific purchase invoice.
  purchaseId: z.string().min(1).optional().nullable(),
  amount: decimalish("Amount").refine((v) => v > 0, "Amount must be greater than 0."),
  method: z.enum(SUPPLIER_PAYMENT_METHODS).default("cash"),
  notes: z.string().trim().max(500).optional().nullable(),
  date: z.coerce.date().optional(),
});

export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
