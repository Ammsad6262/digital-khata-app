/**
 * Minimal plain-text generation helper for narration.
 *
 * Narration has no schema and no side effects, so it only needs a short prompt
 * and a hard timeout. It now goes through `generateText`, which uses the SAME
 * three-model rotation as every other AI call: usage is counted against the
 * daily budget and a cooling/exhausted model is skipped instead of retried.
 */

import { generateText } from "./gemini-client";

export async function generateNarration(
  systemInstruction: string,
  prompt: string,
): Promise<string> {
  const { text, model } = await generateText({
    systemInstruction,
    prompt,
    temperature: 0.2,
    maxOutputTokens: 2048,
    requestTag: "gemini:narrate",
  });

  // A complete sentence is what the caller wants. The caller still validates
  // numbers and sentence completeness, so we hand back the text and only warn.
  const looksComplete = /[.!?]["')\]]?$/.test(text) && text.length >= 40;
  if (!looksComplete) {
    console.warn(
      `[gemini:narrate] ${model} returned a possibly truncated answer (${text.length} chars)`,
    );
  }

  return text;
}