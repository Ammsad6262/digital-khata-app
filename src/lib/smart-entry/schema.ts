/**
 * Smart Khata Entry — Zod schemas (V3: pricing priority + price overrides).
 *
 * V3 CHANGES:
 *   - AI can now return explicitUnitPrice (user said "950 per kg")
 *   - AI can now return explicitTotal (user said "total 24000")
 *   - Backend implements the PRICING PRIORITY:
 *       1. explicitTotal → use it, compute unitPrice = total / qty
 *       2. explicitUnitPrice → use it, compute total = qty × unitPrice
 *       3. product.sellingPrice (default) → use it, compute total
 *       4. None → ask user for price
 *   - Execute endpoint now accepts unitPrice (validated server-side)
 *   - Form UI shows unit price + total, both editable, with live calculation
 *
 * The AI is FORBIDDEN from returning:
 *   - customerId, productId, userId
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
  "UNKNOWN",
]);
export type Intent = z.infer<typeof intentSchema>;

/**
 * V3: The strict schema the AI must return.
 *
 * New fields:
 *   - explicitUnitPrice: user said "950 per kg" or "rate 950" → 950
 *   - explicitTotal: user said "total 24000" or "total was 24000" → 24000
 *
 * The AI must distinguish between:
 *   - quantity (25 kg)
 *   - unit price (950 per kg)
 *   - total amount (24000 total)
 *
 * If the user mentions BOTH a unit price AND a total, the AI returns BOTH.
 * The backend validates they're consistent (qty × unitPrice ≈ total) and
 * asks for clarification if they don't match.
 */
export const aiInterpretationSchema = z.object({
  intent: intentSchema,
  customerName: z.string().min(1).max(200).nullable(),
  productName: z.string().min(1).max(200).nullable(),
  quantity: z.number().finite().positive().nullable(),
  unit: z.string().min(1).max(50).nullable(),
  // V2: user-defined stock batch name (e.g. "Old Rice", "October Cheap Rice")
  batchName: z.string().min(1).max(100).nullable(),
  // V3: explicit price fields from the user's speech
  explicitUnitPrice: z.number().finite().positive().nullable(),
  explicitTotal: z.number().finite().positive().nullable(),
  // V4: amount the customer PAID (NOT the selling price or total!)
  explicitPaidAmount: z.number().finite().positive().nullable(),
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

/**
 * Where the final price came from. Tracked for audit/debugging.
 *
 *   USER_TOTAL          — user said "total 24000" → unitPrice = total/qty
 *   USER_UNIT_PRICE     — user said "950 per kg" → total = qty × unitPrice
 *   DEFAULT_PRODUCT_PRICE — user said no price → used product.sellingPrice
 *   MANUAL_INPUT        — user typed the price in the form manually
 *   CONFLICT_RESOLVED   — user had both unit price + total that didn't match,
 *                         user picked which one to use
 */
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
// Execute request — V3: accepts unitPrice (validated server-side)
// ────────────────────────────────────────────────────────────────────────────

/**
 * V3: The client sends the final form values including unitPrice.
 *
 * The backend RE-VALIDATES everything:
 *   - sessionId belongs to user, not expired
 *   - customerId belongs to user, not deleted
 *   - productId belongs to user, not deleted
 *   - quantity is positive
 *   - unitPrice is positive (if provided)
 *   - amount = quantity × unitPrice (computed SERVER-SIDE, never from client)
 *
 * If unitPrice is NOT provided, the backend uses product.sellingPrice.
 */
export const executeRequestSchema = z.object({
  sessionId: z.string().min(1),
  customerId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0, "Quantity must be a positive number."),
  // V3: optional explicit unit price. If not provided, backend uses product default.
  unitPrice: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0, "Unit price must be a positive number.")
    .optional(),
  // V4: amount the customer paid (partial payment). 0 = full credit sale.
  // Backend validates paidAmount <= totalAmount.
  paidAmount: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v >= 0, "Paid amount must be non-negative.")
    .default(0),
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
