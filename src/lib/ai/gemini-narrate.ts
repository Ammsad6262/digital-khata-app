/**
 * Minimal plain-text generation helper for narration.
 *
 * Kept separate from the Smart Entry provider on purpose: narration has no
 * schema and no side effects, so it only needs a short prompt and a hard
 * timeout. Uses the same model fallback chain as Smart Entry.
 */

import { GoogleGenAI } from "@google/genai";

const MODEL_CHAIN = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.8-flash",
] as const;

const TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("AI request timed out")), ms),
    ),
  ]);
}

export async function generateNarration(
  systemInstruction: string,
  prompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const client = new GoogleGenAI({ apiKey });
  let lastError: unknown;
  let longestTruncated = "";

  for (const model of MODEL_CHAIN) {
    try {
      const response = await withTimeout(
        client.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.2,
            topP: 0.2,
            // Gemini 3 models spend "thinking" tokens from the same output
            // budget, which silently truncated the narration mid-sentence.
            // Thinking is not needed for re-wording facts, so switch it off
            // and keep a generous ceiling for the answer itself.
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        TIMEOUT_MS,
      );

      const text = response.text?.trim();
      if (!text) {
        lastError = new Error("Empty AI response");
        continue;
      }

      // A complete sentence is the only thing worth showing. If a model
      // stops mid-sentence, keep it as a last resort and try the next model
      // — one of them usually finishes the thought.
      const looksComplete = /[.!?]["')\]]?$/.test(text) && text.length >= 40;
      if (looksComplete) {
        console.log(`[gemini:narrate] ${model} returned a complete answer (${text.length} chars)`);
        return text;
      }

      console.warn(
        `[gemini:narrate] ${model} returned a truncated answer (${text.length} chars) — trying next model`,
      );
      if (text.length > longestTruncated.length) longestTruncated = text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[gemini:narrate] ${model} failed: ${message.slice(0, 140)}`);
      lastError = error;
    }
  }

  // No model produced a clean sentence. Hand back the best partial answer so
  // the caller's own validation decides what the user finally sees.
  if (longestTruncated) return longestTruncated;

  throw lastError instanceof Error ? lastError : new Error("AI unavailable");
}
