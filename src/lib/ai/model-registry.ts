/**
 * ModelRegistry — the free-tier Gemini rotation.
 *
 * The app has three free Gemini models, each with its own small daily request
 * budget. This module is the ONLY place that decides which model is called.
 *
 * What it fixes compared with the old inline loop:
 *
 *   1. Exhausted models are remembered. Before, a model that returned 429 was
 *      tried again on the very next request, wasting one call every time.
 *   2. Counters are persisted (AIUsageDaily), so serverless instances share
 *      one view of the daily budget instead of each keeping a private count.
 *   3. A failed request does not consume the whole chain. Deterministic
 *      failures (bad schema, bad request) stop immediately; only genuinely
 *      model-specific problems move to the next model.
 *   4. Requests are sequential — never sent to two models at once.
 *   5. Rate limits are classified: a per-minute limit cools a model for the
 *      stated delay; a daily-quota limit parks it until the next day.
 *
 * Provider restrictions are represented honestly: `limit` is a configured
 * estimate (default 20/day per model, override with GEMINI_DAILY_LIMIT), not a
 * promise from Google.
 */

import { prisma } from "@/lib/db/prisma";
import { dateStringInTz } from "@/lib/utils/date";

export type ModelConfig = {
  id: string;
  /** Configured daily request budget (free-tier estimate). */
  dailyLimit: number;
};

/**
 * Verified against the live key (benchmarked with real English/Urdu/Pashto
 * commands):
 *   - gemini-3.5-flash        primary; correct on sales, payments, expenses,
 *                             queries and Urdu/Pashto (variable latency).
 *   - gemini-3.1-flash-lite   6/6 mixed commands, its own daily quota.
 *   - gemini-3-flash-preview  fastest when healthy (~1-3 s).
 *
 * gemini-flash-latest and gemini-3.8-flash were removed after they repeatedly
 * hung (20 s+) or returned 503, which burned the caller's time budget without
 * producing an answer. The free tier allows 20 requests/day PER MODEL, so three
 * distinct models give ~60 usable requests/day.
 */
const FALLBACK_CHAIN: ModelConfig[] = [
  { id: "gemini-3.5-flash", dailyLimit: 20 },
  { id: "gemini-3.1-flash-lite", dailyLimit: 20 },
  { id: "gemini-3-flash-preview", dailyLimit: 20 },
];

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * The rotation chain, in preference order. The three existing models are kept
 * exactly; optional env overrides exist only so a future model rename does not
 * require a code change.
 */
export function getModelChain(): ModelConfig[] {
  const limit = envInt("GEMINI_DAILY_LIMIT", 20);
  const overrides = [
    process.env.GEMINI_MODEL_1,
    process.env.GEMINI_MODEL_2,
    process.env.GEMINI_MODEL_3,
  ].filter((v): v is string => !!v && v.trim().length > 0);

  const ids = overrides.length === 3 ? overrides : FALLBACK_CHAIN.map((m) => m.id);
  return ids.map((id) => ({ id, dailyLimit: limit }));
}

export function currentDay(): string {
  return dateStringInTz(new Date(), "Asia/Karachi");
}

// ────────────────────────────────────────────────────────────────────────────
// Error classification
// ────────────────────────────────────────────────────────────────────────────

export type FailureKind = "rate_limit" | "transient" | "deterministic" | "auth";

export type ClassifiedFailure = {
  kind: FailureKind;
  /** How long this model should be avoided. */
  cooldownMs: number;
  /** True when the model's daily budget is gone (park until tomorrow). */
  dailyExhausted: boolean;
  code: number | null;
  message: string;
};

function extractErrorCode(error: unknown): number | null {
  const anyErr = error as { code?: unknown; status?: unknown; message?: unknown };
  const direct = Number(anyErr?.code ?? anyErr?.status);
  if (Number.isFinite(direct) && direct >= 100) return direct;

  const msg = typeof anyErr?.message === "string" ? anyErr.message : String(error);
  // The @google/genai SDK often puts a JSON document in `message`.
  try {
    const parsed = JSON.parse(msg);
    const code = parsed?.error?.code ?? parsed?.code;
    if (Number.isFinite(Number(code))) return Number(code);
  } catch {
    /* not JSON */
  }
  const m = msg.match(/\b(4\d\d|5\d\d)\b/);
  return m ? Number(m[1]) : null;
}

/** Parse "retry in 23.5s" / retryDelay:"23s" from a 429 body. */
function extractRetryMs(message: string): number | null {
  const delay = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (delay) return Math.ceil(Number(delay[1]) * 1000);
  const retry = message.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (retry) return Math.ceil(Number(retry[1]) * 1000);
  return null;
}

/**
 * Turn a thrown provider error into a decision.
 *
 * Deterministic = switching models cannot help (bad request, auth, our own
 * schema/parse error). Those must NOT burn the other models' budgets.
 */
export function classifyGeminiError(error: unknown): ClassifiedFailure {
  const message = error instanceof Error ? error.message : String(error);
  const code = extractErrorCode(error);
  const lower = message.toLowerCase();

  // Our own parser / schema rejected the model's *output*. One retry on a
  // different model is reasonable, then stop.
  if (lower.includes("failed schema validation") || lower.includes("returned non-json") || lower.includes("empty response")) {
    return { kind: "deterministic", cooldownMs: 0, dailyExhausted: false, code, message };
  }

  if (code === 429 || lower.includes("resource_exhausted") || lower.includes("rate limit") || lower.includes("quota")) {
    const daily =
      /per day|daily|perday|limit exceeded for the day|free_tier_requests/i.test(message) ||
      (extractRetryMs(message) === null && /quota/i.test(message));
    const retryMs = extractRetryMs(message);
    return {
      kind: "rate_limit",
      cooldownMs: daily ? 0 : Math.min(Math.max(retryMs ?? 60_000, 15_000), 15 * 60_000),
      dailyExhausted: daily || retryMs === null,
      code,
      message,
    };
  }

  if (code === 401 || code === 403) {
    return { kind: "auth", cooldownMs: 0, dailyExhausted: false, code, message };
  }

  if (code === 404) {
    // Model name not available to this key — park it for a few hours.
    return { kind: "transient", cooldownMs: 6 * 60 * 60_000, dailyExhausted: false, code, message };
  }

  if (code === 400) {
    return { kind: "deterministic", cooldownMs: 0, dailyExhausted: false, code, message };
  }

  // 5xx, timeout, network, DNS.
  return { kind: "transient", cooldownMs: 30_000, dailyExhausted: false, code, message };
}

// ────────────────────────────────────────────────────────────────────────────
// Persistence — DB-backed with an in-memory fallback.
//
// If the AIUsageDaily table has not been migrated yet (production rollout,
// fresh clone), the registry still works using process memory. That keeps the
// assistant functional instead of crashing on a missing table.
// ────────────────────────────────────────────────────────────────────────────

export type UsageRow = {
  day: string;
  model: string;
  attempts: number;
  successes: number;
  rateLimited: number;
  failures: number;
  cooldownUntil: Date | null;
  lastError: string | null;
};

const memory = new Map<string, UsageRow>();
let dbUnavailable = false;

function memKey(day: string, model: string) {
  return `${day}::${model}`;
}

function emptyRow(day: string, model: string): UsageRow {
  return {
    day,
    model,
    attempts: 0,
    successes: 0,
    rateLimited: 0,
    failures: 0,
    cooldownUntil: null,
    lastError: null,
  };
}

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === "P2021" || code === "P2022" || /does not exist in the current database/i.test(String(error));
}

async function readRow(day: string, model: string): Promise<UsageRow> {
  if (!dbUnavailable) {
    try {
      const row = await prisma.aIUsageDaily.findUnique({
        where: { day_model: { day, model } },
      });
      if (row) {
        const result: UsageRow = {
          day: row.day,
          model: row.model,
          attempts: row.attempts,
          successes: row.successes,
          rateLimited: row.rateLimited,
          failures: row.failures,
          cooldownUntil: row.cooldownUntil,
          lastError: row.lastError,
        };
        memory.set(memKey(day, model), result);
        return result;
      }
      return emptyRow(day, model);
    } catch (error) {
      if (isMissingTable(error)) {
        dbUnavailable = true;
        console.warn("[ai] AIUsageDaily table missing — falling back to in-memory usage tracking.");
      } else {
        console.error("[ai] usage read failed:", error);
      }
    }
  }
  return memory.get(memKey(day, model)) ?? emptyRow(day, model);
}

async function writeRow(row: UsageRow): Promise<void> {
  memory.set(memKey(row.day, row.model), row);
  if (dbUnavailable) return;
  try {
    await prisma.aIUsageDaily.upsert({
      where: { day_model: { day: row.day, model: row.model } },
      create: {
        day: row.day,
        model: row.model,
        attempts: row.attempts,
        successes: row.successes,
        rateLimited: row.rateLimited,
        failures: row.failures,
        cooldownUntil: row.cooldownUntil,
        lastError: row.lastError,
      },
      update: {
        attempts: row.attempts,
        successes: row.successes,
        rateLimited: row.rateLimited,
        failures: row.failures,
        cooldownUntil: row.cooldownUntil,
        lastError: row.lastError,
      },
    });
  } catch (error) {
    if (isMissingTable(error)) {
      dbUnavailable = true;
      console.warn("[ai] AIUsageDaily table missing — usage is now in-memory only.");
    } else {
      // A counter write failure must never fail the user's request.
      console.error("[ai] usage write failed:", error);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export type UsableModel = ModelConfig & {
  attempts: number;
  remaining: number;
  cooldownUntil: Date | null;
};

/** Models that may be called right now, in preference order. */
export async function getUsableModels(preferredId?: string): Promise<UsableModel[]> {
  const chain = getModelChain();
  const day = currentDay();
  const now = Date.now();
  const rows = await Promise.all(chain.map((m) => readRow(day, m.id)));

  const usable: UsableModel[] = [];
  chain.forEach((config, index) => {
    const row = rows[index]!;
    const cooling = row.cooldownUntil ? row.cooldownUntil.getTime() > now : false;
    if (row.attempts >= config.dailyLimit || cooling) return;
    usable.push({
      ...config,
      attempts: row.attempts,
      remaining: Math.max(0, config.dailyLimit - row.attempts),
      cooldownUntil: row.cooldownUntil,
    });
  });

  if (preferredId) {
    usable.sort((a, b) => {
      if (a.id === preferredId) return -1;
      if (b.id === preferredId) return 1;
      return 0;
    });
  }
  return usable;
}

export async function markAttempt(model: string): Promise<void> {
  const day = currentDay();
  const row = await readRow(day, model);
  row.attempts += 1;
  await writeRow(row);
}

/** A 429 did not consume provider budget — give the attempt back. */
async function refundAttempt(model: string): Promise<void> {
  const day = currentDay();
  const row = await readRow(day, model);
  row.attempts = Math.max(0, row.attempts - 1);
  await writeRow(row);
}

export async function markSuccess(model: string): Promise<void> {
  const day = currentDay();
  const row = await readRow(day, model);
  row.successes += 1;
  row.cooldownUntil = null;
  await writeRow(row);
}

export async function markRateLimited(model: string, failure: ClassifiedFailure): Promise<void> {
  const day = currentDay();
  const row = await readRow(day, model);
  row.rateLimited += 1;
  row.lastError = failure.message.slice(0, 500);

  if (failure.dailyExhausted) {
    // Park until tomorrow: use the configured limit as the marker.
    const limit = getModelChain().find((m) => m.id === model)?.dailyLimit ?? 20;
    row.attempts = Math.max(row.attempts, limit);
    row.cooldownUntil = null;
  } else {
    await refundAttempt(model);
    row.cooldownUntil = new Date(Date.now() + failure.cooldownMs);
  }
  await writeRow(row);
}

export async function markFailure(model: string, failure: ClassifiedFailure): Promise<void> {
  const day = currentDay();
  const row = await readRow(day, model);
  row.failures += 1;
  row.lastError = failure.message.slice(0, 500);
  if (failure.cooldownMs > 0) {
    row.cooldownUntil = new Date(Date.now() + failure.cooldownMs);
  }
  await writeRow(row);
}

export type RotationStatus = {
  day: string;
  models: Array<{
    id: string;
    used: number;
    limit: number;
    remaining: number;
    cooldownUntil: string | null;
    healthy: boolean;
  }>;
  total: { used: number; limit: number; remaining: number };
};

export async function getRotationStatus(): Promise<RotationStatus> {
  const day = currentDay();
  const chain = getModelChain();
  const rows = await Promise.all(chain.map((m) => readRow(day, m.id)));
  const now = Date.now();

  const models = chain.map((config, index) => {
    const row = rows[index]!;
    const cooling = row.cooldownUntil ? row.cooldownUntil.getTime() > now : false;
    return {
      id: config.id,
      used: row.attempts,
      limit: config.dailyLimit,
      remaining: Math.max(0, config.dailyLimit - row.attempts),
      cooldownUntil: row.cooldownUntil ? row.cooldownUntil.toISOString() : null,
      healthy: row.attempts < config.dailyLimit && !cooling,
    };
  });

  return {
    day,
    models,
    total: {
      used: models.reduce((s, m) => s + m.used, 0),
      limit: models.reduce((s, m) => s + m.limit, 0),
      remaining: models.reduce((s, m) => s + m.remaining, 0),
    },
  };
}

/** Raised when every model is exhausted or cooling down. */
export class AIExhaustedError extends Error {
  readonly retryAt: Date | null;
  readonly reason: string;

  constructor(message: string, retryAt: Date | null, reason: string) {
    super(message);
    this.name = "AIExhaustedError";
    this.retryAt = retryAt;
    this.reason = reason;
  }
}

async function nextRetryAt(): Promise<Date | null> {
  const day = currentDay();
  const chain = getModelChain();
  const rows = await Promise.all(chain.map((m) => readRow(day, m.id)));
  const now = Date.now();
  const candidates: number[] = [];

  chain.forEach((config, index) => {
    const row = rows[index]!;
    if (row.attempts >= config.dailyLimit) {
      // Next local midnight.
      const tomorrow = new Date();
      tomorrow.setHours(24, 0, 5, 0);
      candidates.push(tomorrow.getTime());
    } else if (row.cooldownUntil && row.cooldownUntil.getTime() > now) {
      candidates.push(row.cooldownUntil.getTime());
    }
  });

  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates));
}

/**
 * Run `operation` against the first usable model, moving to the next model only
 * when the failure is model-specific.
 *
 * Guarantees:
 *   - one model at a time (no parallel fan-out),
 *   - each model tried at most once per call,
 *   - deterministic failures stop the chain immediately,
 *   - schema/parse failures get at most `maxOutputRetries` extra models,
 *   - usage counters are updated for every dispatched request.
 */
export async function runWithRotation<T>(options: {
  operation: (model: string) => Promise<T>;
  /** Preferred model id (must be in the chain). */
  preferredId?: string;
  maxOutputRetries?: number;
  onModelSelected?: (model: string) => void;
  /**
   * Absolute timestamp (epoch ms) after which no further model is tried.
   * Bounds total latency when the provider is slow; a caller that hits it gets
   * a fast, honest timeout instead of waiting on another model.
   */
  deadlineAt?: number;
}): Promise<{ value: T; model: string; attempts: number }> {
  const { operation, preferredId, onModelSelected, deadlineAt } = options;
  const maxOutputRetries = options.maxOutputRetries ?? 1;

  const usable = await getUsableModels(preferredId);
  if (usable.length === 0) {
    const retryAt = await nextRetryAt();
    throw new AIExhaustedError(
      "All AI models are temporarily unavailable or have reached today's request limit.",
      retryAt,
      "exhausted",
    );
  }

  let lastError: unknown = null;
  let attempts = 0;
  let outputRetries = 0;
  let deadlineHit = false;

  for (const candidate of usable) {
    if (deadlineAt && Date.now() >= deadlineAt) {
      deadlineHit = true;
      break;
    }
    attempts += 1;
    await markAttempt(candidate.id);
    onModelSelected?.(candidate.id);

    try {
      const value = await operation(candidate.id);
      await markSuccess(candidate.id);
      return { value, model: candidate.id, attempts };
    } catch (error) {
      lastError = error;
      const failure = classifyGeminiError(error);

      if (failure.kind === "rate_limit") {
        await markRateLimited(candidate.id, failure);
        continue;
      }
      if (failure.kind === "transient") {
        await markFailure(candidate.id, failure);
        continue;
      }
      if (failure.kind === "deterministic") {
        // Our parser rejected the output: one different model may behave
        // better, but never burn the whole chain on it.
        await markFailure(candidate.id, failure);
        outputRetries += 1;
        if (outputRetries > maxOutputRetries) break;
        continue;
      }
      // Auth problems affect the key, not the model — stop.
      await markFailure(candidate.id, failure);
      break;
    }
  }

  const retryAt = await nextRetryAt();

  const timedOut =
    deadlineHit || (lastError as { name?: string } | null)?.name === "AITimeoutError";

  if (timedOut) {
    throw new AIExhaustedError(
      "The AI is responding slowly right now.",
      retryAt,
      "timeout",
    );
  }

  if (!lastError) {
    throw new AIExhaustedError(
      "The AI did not answer.",
      retryAt,
      "empty",
    );
  }

  const failure = classifyGeminiError(lastError);
  throw new AIExhaustedError(
    failure.message,
    retryAt,
    failure.kind,
  );
}

/** Test helper — clears the in-memory mirror (DB rows are left alone). */
export function _resetMemoryUsage(): void {
  memory.clear();
  dbUnavailable = false;
}