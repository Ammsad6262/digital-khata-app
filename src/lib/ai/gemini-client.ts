/**
 * Low-level Gemini client shared by Smart Entry and the assistant.
 *
 * Responsibilities:
 *   - creates the SDK client once (API key read server-side only),
 *   - runs a request through the three-model rotation,
 *   - extracts JSON even when the model wraps it in markdown or prose,
 *   - reports which model answered and how many requests were consumed.
 *
 * It does NOT interpret business meaning; callers pass their own prompt and
 * parser.
 */

import { GoogleGenAI } from "@google/genai";
import { runWithRotation } from "./model-registry";

let client: GoogleGenAI | null = null;

export class AIUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIUnavailableError";
  }
}

export function getGeminiClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIUnavailableError(
      "GEMINI_API_KEY is not configured. Set it in .env to enable the AI assistant.",
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

/** Test-only: inject/replace the SDK client. */
export function _setGeminiClientForTesting(value: GoogleGenAI | null): void {
  client = value;
}

/**
 * Pull a JSON object out of a model response.
 *
 * Flash models occasionally wrap JSON in ```json fences or add a sentence
 * before it, even with responseMimeType set. Failing the whole request for
 * that is wasteful, so we recover the object.
 */
export function extractJsonObject(text: string): unknown {
  const raw = text.trim();
  if (!raw) throw new Error("Gemini returned an empty response.");

  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    /* fall through */
  }

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = unfenced.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      /* fall through */
    }
  }

  throw new Error(
    `Gemini returned non-JSON output (first 200 chars): ${raw.slice(0, 200)}`,
  );
}

export type GenerateOptions<T> = {
  systemInstruction: string;
  /** Plain text, or multi-part content (e.g. audio + instruction). */
  contents: string | { parts: Array<Record<string, unknown>> };
  responseSchema: Record<string, unknown>;
  /** Convert the parsed JSON into the caller's validated type; throw on bad output. */
  parse: (value: unknown) => T;
  temperature?: number;
  preferredId?: string;
  maxOutputRetries?: number;
  requestTag?: string;
};

export async function generateStructured<T>(
  options: GenerateOptions<T>,
): Promise<{ value: T; model: string; attempts: number; ms: number }> {
  const genai = getGeminiClient();
  const started = Date.now();
  const tag = options.requestTag ?? "ai";
  let selectedModel = "";

  const result = await runWithRotation({
    preferredId: options.preferredId,
    maxOutputRetries: options.maxOutputRetries,
    onModelSelected: (model) => {
      selectedModel = model;
      console.log(`[${tag}] calling ${model}`);
    },
    operation: async (model) => {
      const response = await genai.models.generateContent({
        model,
        contents: options.contents,
        config: {
          systemInstruction: options.systemInstruction,
          temperature: options.temperature ?? 0.1,
          topP: 0.1,
          responseMimeType: "application/json",
          responseSchema: options.responseSchema,
        },
      });

      const text = response.text;
      if (!text) throw new Error("Gemini returned an empty response.");
      const json = extractJsonObject(text);
      return options.parse(json);
    },
  });

  const ms = Date.now() - started;
  console.log(
    `[${tag}] ok model=${result.model} attempts=${result.attempts} ms=${ms}`,
  );
  return { ...result, ms, model: result.model || selectedModel };
}