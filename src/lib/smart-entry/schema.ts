/**
 * Smart Khata Entry — Zod schemas (V2: editable-form architecture).
 *
 * KEY CHANGE FROM V1:
 *   V1 treated partial AI output as an error → user saw "Something went wrong".
 *   V2 treats partial AI output as normal → user sees an editable form with
 *   whatever the AI understood pre-filled, and missing fields left empty for
 *   the user to complete manually. The AI is just a form-filler, not an
 *   authority.
 *
 * The AI is FORBIDDEN from returning:
 *   - customerId, productId, userId, amount, price, balance
 *   - SQL or any executable instruction
 *   - fields other than the ones in aiInterpretationSchema
 *
 * Backend resolves names → IDs against the CURRENT USER's records only,
 * and computes the amount server-side.
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
 * The strict schema the AI must return.
 *
 * V2 behavior:
 *   - Return NULL for any field you can't confidently extract.
 *   - Do NOT set needsClarification for missing fields — just return null.
 *   - Only set needsClarification=true if you genuinely can't tell what the
 *     user wants at all (e.g. they said "hello" or asked a question).
 *   - The transcript field is what the AI thinks it heard (for display).
 *
 * The backend will:
 *   - Take whatever fields are non-null and pre-fill the form
 *   - Leave null fields empty for the user to fill manually
 *   - Never show an error for partial input
 */
export const aiInterpretationSchema = z.object({
  intent: intentSchema,
  customerName: z.string().min(1).max(200).nullable(),
  productName: z.string().min(1).max(200).nullable(),
  quantity: z.number().finite().positive().nullable(),
  unit: z.string().min(1).max(50).nullable(),
  // Self-reported confidence 0..1 (informational only — backend never gates on this)
  confidence: z.number().min(0).max(1).optional(),
  // Only true when the AI genuinely can't tell what the user wants
  // (e.g. user said "hello" or asked a non-transaction question)
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().max(500).nullable().optional(),
  // What the AI thinks it heard (for display only)
  transcript: z.string().max(2000).nullable().optional(),
});

export type AiInterpretation = z.infer<typeof aiInterpretationSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Interpret request — what the browser sends to /api/smart-entry/interpret
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
// Execute request — V2: client sends the FINAL form values
// ────────────────────────────────────────────────────────────────────────────

/**
 * V2: The client sends the final form values after the user reviews/edits.
 *
 * The backend RE-VALIDATES everything:
 *   - sessionId belongs to the authenticated user
 *   - sessionId is in AWAITING_CONFIRMATION state, not expired
 *   - customerId belongs to the authenticated user, not deleted
 *   - productId belongs to the authenticated user, not deleted
 *   - quantity is positive
 *   - unitPrice is fetched from the product (NEVER trusted from client)
 *   - amount is computed server-side: quantity × unitPrice
 *
 * Then calls the existing SaleService.createSale() — same trusted path as
 * the manual sale form.
 */
export const executeRequestSchema = z.object({
  sessionId: z.string().min(1),
  customerId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0, "Quantity must be a positive number."),
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Statuses the interpret endpoint can return (V2 simplified)
// ────────────────────────────────────────────────────────────────────────────

/**
 * V2: only 3 statuses.
 *
 *   FORM    — show the editable form (with whatever fields the AI understood
 *             pre-filled). This is the normal state, even for partial input.
 *   FAILED  — only for genuine infrastructure failures (AI unavailable,
 *             network error, geo-blocked). NOT for partial understanding.
 *
 * Note: ambiguous customer/product, missing quantity, unknown product, etc.
 * are ALL handled by FORM status — the form just leaves those fields empty
 * or shows a picker. The user completes them manually.
 */
export const interpretStatusSchema = z.enum([
  "FORM",
  "FAILED",
]);
export type InterpretStatus = z.infer<typeof interpretStatusSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Entity candidate — for the searchable pickers
// ────────────────────────────────────────────────────────────────────────────

export const entityCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  sellingPrice: z.string().nullable().optional(),
});
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;
