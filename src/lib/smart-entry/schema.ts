/**
 * Smart Khata Entry — Zod schemas.
 *
 * These schemas validate:
 *   1. The raw AI output (must conform to a strict shape; unknown fields
 *      are stripped, malformed values rejected).
 *   2. The interpret API request body (text input OR audio base64).
 *   3. The execute API request body (just sessionId — nothing else
 *      trustable from the client).
 *
 * CRITICAL: the AI output schema ONLY contains names and quantities —
 * NEVER database IDs, prices, or amounts. Those are resolved/computed
 * by the backend.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// AI output schema — what the LLM is allowed to return
// ────────────────────────────────────────────────────────────────────────────

/**
 * The intent the AI thinks the user expressed.
 *
 * V1 supports ONLY CREATE_CREDIT_SALE.
 *
 * UNKNOWN is a catch-all for "I heard the user but I don't recognize what
 * kind of transaction they want" — the backend will ask for clarification.
 */
export const intentSchema = z.enum([
  "CREATE_CREDIT_SALE",
  "UNKNOWN",
]);
export type Intent = z.infer<typeof intentSchema>;

/**
 * The strict schema the AI must return.
 *
 * - All name fields are STRINGS (names, not IDs).
 * - quantity is a positive number (or null if not mentioned).
 * - unit is a short string (kg, piece, bag, etc.) or null.
 * - needsClarification triggers a follow-up question flow.
 * - clarificationQuestion is shown to the user when needsClarification=true.
 *
 * The AI is FORBIDDEN from returning:
 *   - customerId, productId, userId, amount, price, balance
 *   - SQL or any executable instruction
 *   - fields other than the ones below
 */
export const aiInterpretationSchema = z.object({
  intent: intentSchema,
  customerName: z.string().min(1).max(200).nullable(),
  productName: z.string().min(1).max(200).nullable(),
  quantity: z
    .number()
    .finite()
    .positive()
    .nullable(),
  unit: z.string().min(1).max(50).nullable(),
  // Self-reported confidence 0..1 (informational only — backend never gates on this)
  confidence: z.number().min(0).max(1).optional(),
  // When true, clarificationQuestion is required and the backend will surface it.
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().max(500).nullable().optional(),
  // What the AI thinks it heard (for display only — backend uses the actual
  // transcript for the "You said: ..." UI)
  transcript: z.string().max(2000).nullable().optional(),
});

export type AiInterpretation = z.infer<typeof aiInterpretationSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Interpret request — what the browser sends to /api/smart-entry/interpret
// ────────────────────────────────────────────────────────────────────────────

/**
 * Text input: user typed a sentence.
 * Audio input: user recorded their voice — sent as base64-encoded audio
 *   bytes plus a mimeType (e.g. "audio/webm" or "audio/mp4").
 *
 * Exactly ONE of `text` or `audio` must be provided.
 */
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
// Execute request — what the browser sends to /api/smart-entry/execute
// ────────────────────────────────────────────────────────────────────────────

/**
 * The client sends ONLY the sessionId. No customerId, productId, amount —
 * those come from the server-side SmartEntrySession row.
 *
 * Optional `resolvedCustomerId` / `resolvedProductId` are accepted ONLY for
 * the disambiguation flow: when interpret returned status="AMBIGUOUS_CUSTOMER"
 * with a list of candidates, the user picks one and the client sends that ID
 * back here. The backend RE-VALIDATES that the chosen ID belongs to this user
 * before using it.
 */
export const executeRequestSchema = z.object({
  sessionId: z.string().min(1),
  // Only allowed when the session was in AMBIGUOUS_* state.
  chosenCustomerId: z.string().min(1).optional(),
  chosenProductId: z.string().min(1).optional(),
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Statuses the interpret endpoint can return
// ────────────────────────────────────────────────────────────────────────────

export const interpretStatusSchema = z.enum([
  "READY",                    // everything resolved, show confirmation
  "CLARIFICATION_NEEDED",     // AI asked for more info
  "AMBIGUOUS_CUSTOMER",       // multiple customer candidates — show picker
  "AMBIGUOUS_PRODUCT",        // multiple product candidates — show picker
  "CUSTOMER_NOT_FOUND",       // no customer matched
  "PRODUCT_NOT_FOUND",        // no product matched
  "UNSUPPORTED_INTENT",       // user said something V1 doesn't support
  "FAILED",                    // AI/network error
]);
export type InterpretStatus = z.infer<typeof interpretStatusSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Entity candidate — for disambiguation pickers
// ────────────────────────────────────────────────────────────────────────────

export const entityCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  // For customers: phone (helps distinguish two Ahmads)
  phone: z.string().nullable().optional(),
  // For products: unit + price (helps user recognize the right product)
  unit: z.string().nullable().optional(),
  sellingPrice: z.string().nullable().optional(),
});
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;
