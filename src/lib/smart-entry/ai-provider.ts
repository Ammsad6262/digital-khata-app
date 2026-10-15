/**
 * AIProvider — abstraction over the AI backend used for Smart Khata Entry.
 *
 * The Smart Khata system NEVER calls Gemini/OpenAI/Anthropic directly.
 * It calls this interface. This means:
 *
 *   - Switching from Gemini to another provider (OpenAI, Anthropic, Groq,
 *     self-hosted Llama) requires writing ONE new class implementing this
 *     interface — no other code in the app changes.
 *   - Swapping the model identifier (e.g. `gemini-3.5-flash` → `gemini-4-flash`)
 *     is a one-line change in the GeminiProvider, not a sweep of the codebase.
 *   - Tests can mock the AIProvider entirely (no real API calls, no cost).
 *
 * Both methods return a validated `AiInterpretation` — never raw provider output.
 * Providers MUST validate their own output against the Zod schema and either
 * return a valid AiInterpretation or throw an Error.
 */

import type { AiInterpretation } from "./schema";

export interface AIProvider {
  /** Provider name for audit logging (e.g. "gemini-3.5-flash"). */
  readonly name: string;

  /**
   * Interpret a TEXT input.
   *
   * @param text         The user's typed sentence (Urdu, Roman Urdu, English, etc.)
   * @param context      The user's customer names + product names + units (NO IDs).
   *                     Used by the AI to recognize named entities. The AI sees
   *                     only names — never IDs, prices, balances, or counts.
   * @returns            Validated, schema-conformant AI interpretation.
   */
  interpretText(text: string, context: AIContext): Promise<AiInterpretation>;

  /**
   * Transcribe audio AND interpret it in one call.
   *
   * Returns both the transcript (for display "You said: ...") and the
   * structured interpretation.
   *
   * @param audio        Raw audio bytes.
   * @param mimeType     e.g. "audio/webm", "audio/mp4", "audio/wav"
   * @param context      Same as interpretText.
   */
  transcribeAndInterpret(
    audio: Uint8Array,
    mimeType: string,
    context: AIContext,
  ): Promise<{ transcript: string; interpretation: AiInterpretation }>;
}

/**
 * Context provided to the AI for entity recognition.
 *
 * CRITICAL: This contains ONLY names — never IDs, prices, balances, or
 * any sensitive data. The AI cannot leak IDs it never received.
 */
export interface AIContext {
  // Customer names the current user has (max 100, ordered by recency).
  customerNames: string[];
  // Product names the current user has (max 100).
  productNames: string[];
  // Units the current user has configured (defaults + custom).
  units: string[];
}
