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
            maxOutputTokens: 1024,
          },
        }),
        TIMEOUT_MS,
      );

      const text = response.text?.trim();
      if (text) return text;
      lastError = new Error("Empty AI response");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI unavailable");
}
