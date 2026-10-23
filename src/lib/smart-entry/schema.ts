/**
 * Smart Khata Entry — Zod schemas (V10: multi-intent).
 *
 * V10 CHANGES:
 *   - Expanded intent enum: CREATE_CREDIT_SALE, CREATE_EXPENSE, RECORD_PAYMENT,
 *     CREATE_CUSTOMER, CREATE_PRODUCT, STOCK_INTAKE, QUERY, UNKNOWN
 *   - New fields: expenseName, expenseCategory, queryType, queryEntity
 *   - The backend routes by intent to the appropriate form/execute function
 *
 * The AI is FORBIDDEN from returning:
 *   - customerId, productId, userId, expenseId, paymentId
 *   - SQL or any executable instruction
 *
 * Backend resolves names → IDs against the CURRENT USER's records only,
 * and computes the final amount server-side using Decimal (no float math).
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// AI output schema — what the LLM is allowed to return
// ────────────────────────────────────────────────────────────────────────────

export const intentSchema = z.enum([
  "CREATE_CREDIT_SALE",
  "CREATE_EXPENSE",
  "RECORD_PAYMENT",
  "CREATE_CUSTOMER",
  "CREATE_PRODUCT",
  "STOCK_INTAKE",
  "SUPPLIER_PAYMENT",
  "CREATE_REMINDER",
  "CREATE_PURCHASE",
  "QUERY",
  "UNKNOWN",
]);
export type Intent = z.infer<typeof intentSchema>;

/**
 * V10: The strict schema the AI must return.
 *
 * New intent categories:
 *   - CREATE_CREDIT_SALE: "Ahmad bought 25 kg rice" → sale form
 *   - CREATE_EXPENSE: "I spent 500 on electricity" → expense form
 *   - RECORD_PAYMENT: "Ahmad paid me 5000" → payment form
 *   - CREATE_CUSTOMER: "Add a customer named Ali" → customer creation form
 *   - CREATE_PRODUCT: "Add a product called tea" → product creation wizard
 *   - STOCK_INTAKE: "I bought 50 kg rice at 900 per kg" → stock intake form
 *   - QUERY: "How much did I spend today?" → query result display
 *   - UNKNOWN: intent unclear → ask for clarification
 *
 * Fields are shared across intents. The AI fills whichever fields are
 * relevant to the detected intent. Irrelevant fields are null.
 */
export const aiInterpretationSchema = z.object({
  intent: intentSchema,
  // Sale fields
  customerName: z.string().min(1).max(200).nullable(),
  productName: z.string().min(1).max(200).nullable(),
  quantity: z.number().finite().positive().nullable(),
  unit: z.string().min(1).max(50).nullable(),
  batchName: z.string().min(1).max(100).nullable(),
  explicitUnitPrice: z.number().finite().positive().nullable(),
  explicitTotal: z.number().finite().positive().nullable(),
  explicitPaidAmount: z.number().finite().positive().nullable(),

  // Expense fields (V10)
  expenseName: z.string().min(1).max(200).nullable(),
  expenseCategory: z.enum([
    "transport", "shop", "electricity", "packaging",
    "salary", "rent", "other",
  ]).nullable().optional(),

  // Supplier payment fields
  supplierName: z.string().min(1).max(200).nullable().optional(),

  // Reminder fields
  reminderTitle: z.string().min(1).max(150).nullable().optional(),
  reminderInDays: z.number().int().min(0).max(3650).nullable().optional(),
  reminderPriority: z.enum(["low", "normal", "high"]).nullable().optional(),
  reminderType: z.enum([
    "payment_collection", "supplier_payment", "customer_followup",
    "stock_reorder", "custom",
  ]).nullable().optional(),

  // Query fields (V10)
  queryType: z.enum([
    "TODAYS_EXPENSES", "TODAYS_SALES", "CUSTOMER_BALANCES",
    "STOCK_LEVEL", "EXPENSES_SUMMARY", "SALES_SUMMARY",
    "CUSTOMER_PAYMENT_HISTORY", "SUPPLIER_PAYABLES", "TODAYS_REMINDERS",
    "LOW_STOCK", "INACTIVE_CUSTOMERS", "REORDER_CANDIDATES", "SUPPLIER_PURCHASES",
    "OTHER",
  ]).nullable().optional(),
  queryEntity: z.string().max(200).nullable().optional(),
  queryDateRange: z.enum(["today", "yesterday", "week", "month", "all"]).nullable().optional(),

  // Self-reported confidence 0..1
  confidence: z.number().min(0).max(1).optional(),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().max(500).nullable().optional(),
  transcript: z.string().max(2000).nullable().optional(),
});

export type AiInterpretation = z.infer<typeof aiInterpretationSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Price source tracking
// ────────────────────────────────────────────────────────────────────────────

export const priceSourceSchema = z.enum([
  "USER_TOTAL",
  "USER_UNIT_PRICE",
  "DEFAULT_PRODUCT_PRICE",
  "MANUAL_INPUT",
  "CONFLICT_RESOLVED",
]);
export type PriceSource = z.infer<typeof priceSourceSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Interpret request
// ────────────────────────────────────────────────────────────────────────────

export const interpretRequestSchema = z
  .object({
    text: z.string().trim().min(2, "Too short.").max(500, "Too long.").optional(),
    audio: z
      .object({
        base64: z.string().min(10),
        mimeType: z.string().min(5).max(100),
      })
      .optional(),
  })
  .refine(
    (data) => (data.text ? !data.audio : data.audio ? !data.text : false),
    "Provide exactly ONE of `text` or `audio`.",
  );

export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Execute request — V10: supports multiple intent types
// ────────────────────────────────────────────────────────────────────────────

/**
 * V10: The client sends the final form values. The `intentType` field tells
 * the backend which execute function to call.
 *
 * For CREATE_CREDIT_SALE: customerId, productId, quantity, unitPrice, paidAmount, batchId
 * For CREATE_EXPENSE: expenseName, amount, category, notes, date
 * For RECORD_PAYMENT: customerId, amount, method, notes, date
 * For STOCK_INTAKE: productId, quantity, unitCost, batchName, date
 */
export const executeRequestSchema = z.object({
  sessionId: z.string().min(1),
  intentType: z.enum([
    "CREATE_CREDIT_SALE",
    "CREATE_EXPENSE",
    "RECORD_PAYMENT",
    "STOCK_INTAKE",
    "CREATE_PRODUCT",
    "CREATE_CUSTOMER",
    "SUPPLIER_PAYMENT",
    "CREATE_REMINDER",
    "CREATE_PURCHASE",
  ]).default("CREATE_CREDIT_SALE"),

  // Sale fields
  customerId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .optional(),
  unitPrice: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .optional(),
  paidAmount: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .optional(),
  batchId: z.string().min(1).optional(),

  // Expense fields
  expenseName: z.string().min(1).max(200).optional(),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .optional(),
  expenseCategory: z.enum([
    "transport", "shop", "electricity", "packaging",
    "salary", "rent", "other",
  ]).optional(),
  notes: z.string().max(500).optional(),
  date: z.string().optional(),

  // Payment fields
  method: z.enum(["cash", "bank", "cheque", "jazzcash", "easypaisa", "other"]).optional(),

  // Stock intake fields
  unitCost: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .optional(),
  batchName: z.string().max(100).optional().nullable(),

  // V13: CREATE_PRODUCT fields
  name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(20).optional(),
  purchasePrice: z.union([z.number(), z.string()]).transform((v) => (typeof v === "string" ? Number(v) : v)).optional(),
  sellingPrice: z.union([z.number(), z.string()]).transform((v) => (typeof v === "string" ? Number(v) : v)).optional(),
  openingStock: z.union([z.number(), z.string()]).transform((v) => (typeof v === "string" ? Number(v) : v)).optional(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
  category: z.string().max(50).optional().nullable(),
  sku: z.string().max(50).optional().nullable(),
  // V13: CREATE_CUSTOMER fields
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  openingBalance: z.union([z.number(), z.string()]).transform((v) => (typeof v === "string" ? Number(v) : v)).optional(),

  // Supplier payment fields
  supplierId: z.string().min(1).optional(),

  // Reminder fields
  reminderTitle: z.string().min(1).max(150).optional(),
  reminderDueAt: z.string().optional(),
  reminderPriority: z.enum(["low", "normal", "high"]).optional(),
  reminderType: z.enum([
    "payment_collection", "supplier_payment", "customer_followup",
    "stock_reorder", "custom",
  ]).optional(),
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Statuses
// ────────────────────────────────────────────────────────────────────────────

export const interpretStatusSchema = z.enum([
  "FORM",
  "FAILED",
]);
export type InterpretStatus = z.infer<typeof interpretStatusSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Entity candidate
// ────────────────────────────────────────────────────────────────────────────

export const entityCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  sellingPrice: z.string().nullable().optional(),
});
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;
