/**
 * Low-level Gemini client shared by Smart Entry and the assistant.
 *
 * Responsibilities:
 *   - creates the SDK client once (API key read server-side only),
 *   - runs a request through the three-model rotation,
 *   - extracts JSON even when the model wraps it in markdown or prose,
 *   - reports which model answered and how many requests were consumed,
 *   - keeps every request BOUNDED so the assistant never hangs.
 *
 * Latency is the reason this file has a timeout budget at all. The free Gemini
 * endpoints can take 40-45 s to answer (or never answer), and the rotation used
 * to try up to three of them back to back — a single command could block for
 * more than a minute. Now each attempt is capped, the whole call has a deadline,
 * thinking is switched off, and the output is capped. A slow provider produces
 * a fast, honest "try again" instead of a frozen screen.
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

/** The provider did not answer inside the per-attempt budget. */
export class AITimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AITimeoutError";
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Cap on a single model call (local abort). */
export function attemptTimeoutMs(): number {
  return envInt("GEMINI_TIMEOUT_MS", 16_000);
}

/** Cap on the whole rotation (all models together). */
export function deadlineMs(): number {
  return envInt("GEMINI_DEADLINE_MS", 24_000);
}

/**
 * Transport timeout handed to the SDK.
 *
 * The provider rejects a manually-set deadline below 10s with
 * INVALID_ARGUMENT ("Minimum allowed deadline is 10s"), so this must stay
 * generous; the *local* abort budget above is what actually keeps us fast.
 */
export function httpTimeoutMs(): number {
  return Math.max(10_000, envInt("GEMINI_HTTP_TIMEOUT_MS", 30_000));
}

export function getGeminiClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIUnavailableError(
      "GEMINI_API_KEY is not configured. Set it in .env to enable the AI assistant.",
    );
  }
  client = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: httpTimeoutMs() },
  });
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

/** A 400 that only complains about the thinkingConfig field. */
function isUnsupportedThinkingConfig(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const mentionsThinking = /thinking|thinkingconfig|thinkingbudget/.test(message);
  const mentionsBadField = /unknown name|unknown field|cannot find field|invalid json payload|not supported/.test(message);
  return mentionsThinking && (mentionsBadField || /400|invalid_argument/.test(message));
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
  /** Override the per-model timeout (ms). */
  timeoutMs?: number;
  /** Override the whole-call deadline (ms). */
  deadlineLimitMs?: number;
};

export async function generateStructured<T>(
  options: GenerateOptions<T>,
): Promise<{ value: T; model: string; attempts: number; ms: number }> {
  const genai = getGeminiClient();
  const started = Date.now();
  const tag = options.requestTag ?? "ai";
  let selectedModel = "";

  const perAttempt = options.timeoutMs ?? attemptTimeoutMs();
  const overall = options.deadlineLimitMs ?? deadlineMs();
  const deadlineAt = started + overall;
  const maxOutputTokens = envInt("GEMINI_MAX_OUTPUT_TOKENS", 800);
  const thinkingBudget = envInt("GEMINI_THINKING_BUDGET", 0);

  const result = await runWithRotation({
    preferredId: options.preferredId,
    maxOutputRetries: options.maxOutputRetries,
    deadlineAt,
    onModelSelected: (model) => {
      selectedModel = model;
      console.log(`[${tag}] calling ${model}`);
    },
    operation: async (model) => {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 250) {
        throw new AITimeoutError(
          `No time left in the AI budget to call ${model}.`,
        );
      }
      const budget = Math.max(500, Math.min(perAttempt, remaining));
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, budget);

      const config = (withThinking: boolean): Record<string, unknown> => ({
        systemInstruction: options.systemInstruction,
        temperature: options.temperature ?? 0.1,
        topP: 0.1,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: options.responseSchema,
        abortSignal: controller.signal,
        ...(withThinking ? { thinkingConfig: { thinkingBudget: thinkingBudget } } : {}),
      });

      try {
        let response;
        try {
          response = await genai.models.generateContent({
            model,
            contents: options.contents,
            config: config(thinkingBudget >= 0),
          } as never);
        } catch (error) {
          // Never retry after a timeout — that would double the wait.
          if (controller.signal.aborted) throw error;
          if (isUnsupportedThinkingConfig(error)) {
            response = await genai.models.generateContent({
              model,
              contents: options.contents,
              config: config(false),
            } as never);
          } else {
            throw error;
          }
        }

        const text = response.text;
        if (!text) throw new Error("Gemini returned an empty response.");
        const json = extractJsonObject(text);
        return options.parse(json);
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AITimeoutError(
            `Model ${model} did not answer within ${budget}ms.`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  });

  const ms = Date.now() - started;
  console.log(
    `[${tag}] ok model=${result.model} attempts=${result.attempts} ms=${ms}`,
  );
  return { ...result, ms, model: result.model || selectedModel };
}

export type GenerateTextOptions = {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  requestTag?: string;
};

/**
 * Plain-text generation (no JSON schema) through the SAME three-model rotation.
 *
 * Narration used to carry its own private model list, so its requests were
 * invisible to the daily counters and it never honoured a model's cooldown.
 * Routing it through `runWithRotation` fixes both: every attempt is counted and
 * an exhausted/cooling model is skipped like everywhere else.
 */
export async function generateText(
  options: GenerateTextOptions,
): Promise<{ text: string; model: string; attempts: number; ms: number }> {
  const genai = getGeminiClient();
  const started = Date.now();
  const tag = options.requestTag ?? "ai:text";
  const perAttempt = attemptTimeoutMs();
  const deadlineAt = started + deadlineMs();
  const maxOutputTokens = options.maxOutputTokens ?? 2048;

  const result = await runWithRotation({
    deadlineAt,
    operation: async (model) => {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 250) {
        throw new AITimeoutError(`No time left in the AI budget to call ${model}.`);
      }
      const budget = Math.max(500, Math.min(perAttempt, remaining));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), budget);

      try {
        const response = await genai.models.generateContent({
          model,
          contents: options.prompt,
          config: {
            systemInstruction: options.systemInstruction,
            temperature: options.temperature ?? 0.2,
            topP: 0.2,
            maxOutputTokens,
            // Thinking tokens silently truncated narration; this text is a
            // re-wording of facts the app already computed, not reasoning.
            thinkingConfig: { thinkingBudget: 0 },
            abortSignal: controller.signal,
          },
        } as never);

        const text = response.text?.trim();
        if (!text) throw new Error("Gemini returned an empty response.");
        return text;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AITimeoutError(`Model ${model} did not answer within ${budget}ms.`);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  });

  const ms = Date.now() - started;
  console.log(`[${tag}] ok model=${result.model} attempts=${result.attempts} ms=${ms}`);
  return { text: result.value, model: result.model, attempts: result.attempts, ms };
}
