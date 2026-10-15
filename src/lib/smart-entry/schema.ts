/**
 * Smart Entry — Zod schemas for AI output + API requests.
 *
 * The AI is FORBIDDEN from returning database IDs. Backend resolves names
 * → IDs against the CURRENT USER's records only.
 */

import { z } from "zod";

// ── Intent enum ──────────────────────────────────────────────────────────────

export const intentSchema = z.enum([
  "CREATE_CREDIT_SALE",
  "CREATE_EXPENSE",
  "RECORD_PAYMENT",
  "CREATE_CUSTOMER",
  "CREATE_PRODUCT",
  "STOCK_INTAKE",
  "QUERY",
  "UNKNOWN",
]);
export type Intent = z.infer<typeof intentSchema>;

// ── AI output schema ─────────────────────────────────────────────────────────

export const aiInterpretationSchema = z.object({
  intent: intentSchema,
  customerName: z.string().min(1).max(200).nullable(),
  productName: z.string().min(1).max(200).nullable(),
  quantity: z.number().finite().positive().nullable(),
  unit: z.string().min(1).max(50).nullable(),
  batchName: z.string().min(1).max(100).nullable(),
  explicitUnitPrice: z.number().finite().positive().nullable(),
  explicitTotal: z.number().finite().positive().nullable(),
  explicitPaidAmount: z.number().finite().min(0).nullable(),
  expenseName: z.string().min(1).max(200).nullable(),
  expenseCategory: z.enum([
    "transport", "shop", "electricity", "packaging",
    "salary", "rent", "other",
  ]).nullable().optional(),
  queryType: z.enum([
    "TODAYS_EXPENSES", "TODAYS_SALES", "CUSTOMER_BALANCES",
    "STOCK_LEVEL", "EXPENSES_SUMMARY", "SALES_SUMMARY",
    "CUSTOMER_PAYMENT_HISTORY", "OTHER",
  ]).nullable().optional(),
  queryEntity: z.string().max(200).nullable().optional(),
  queryDateRange: z.enum(["today", "yesterday", "week", "month", "all"]).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().max(500).nullable().optional(),
  transcript: z.string().max(2000).nullable().optional(),
});

export type AiInterpretation = z.infer<typeof aiInterpretationSchema>;

// ── Interpret request ────────────────────────────────────────────────────────

export const interpretRequestSchema = z
  .object({
    text: z.string().trim().min(2).max(500).optional(),
    audio: z.object({
      base64: z.string().min(10),
      mimeType: z.string().min(5).max(100),
    }).optional(),
  })
  .refine(
    (data) => (data.text ? !data.audio : data.audio ? !data.text : false),
    "Provide exactly ONE of `text` or `audio`.",
  );

export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

// ── Execute request ──────────────────────────────────────────────────────────

export const executeRequestSchema = z.object({
  sessionId: z.string().min(1),
  intentType: z.enum([
    "CREATE_CREDIT_SALE",
    "CREATE_EXPENSE",
    "RECORD_PAYMENT",
    "STOCK_INTAKE",
    "CREATE_PRODUCT",
    "CREATE_CUSTOMER",
  ]).default("CREATE_CREDIT_SALE"),

  customerId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  quantity: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
  unitPrice: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
  paidAmount: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
  batchId: z.string().min(1).optional(),

  expenseName: z.string().min(1).max(200).optional(),
  amount: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
  expenseCategory: z.enum(["transport", "shop", "electricity", "packaging", "salary", "rent", "other"]).optional(),
  notes: z.string().max(500).optional(),
  date: z.string().optional(),
  method: z.enum(["cash", "bank", "cheque", "jazzcash", "easypaisa", "other"]).optional(),
  unitCost: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
  batchName: z.string().max(100).optional().nullable(),

  name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(20).optional(),
  purchasePrice: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
  sellingPrice: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
  openingStock: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
  category: z.string().max(50).optional().nullable(),
  sku: z.string().max(50).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  openingBalance: z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? Number(v) : v).optional(),
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

// ── Entity candidate ─────────────────────────────────────────────────────────

export const entityCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  sellingPrice: z.string().nullable().optional(),
});
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;
