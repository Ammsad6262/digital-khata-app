/**
 * AI narration for the Growth Assistant.
 *
 * The AI is allowed to re-word the deterministic plan — nothing else.
 * Every number it writes is validated against the fact sheet; if it invents
 * even one figure, the deterministic summary is returned instead.
 */

import { generateNarration } from "@/lib/ai/gemini-narrate";
import { getGrowthPlan, growthFactsForNarration } from "@/lib/services/growth";

const SYSTEM_INSTRUCTION = `You are a business analyst for a small Pakistani wholesale shop.
Rewrite the supplied FACTS into at most 3 short, practical sentences.

Hard rules:
- Use ONLY numbers that appear in FACTS. Never invent an amount, percentage or count.
- Never call revenue profit, earnings or income.
- Do not promise outcomes or forecast future sales.
- Do not use markdown, bullet points, headings or emojis.
- Write plainly, in the second person ("you"), as advice.
- If the facts list no recommendations, say there is nothing to act on yet.`;

export type GrowthNarration = {
  text: string;
  source: "ai" | "deterministic";
  /** Why the deterministic summary was used (absent for AI answers). */
  reason?: "empty-plan" | "ai-failed" | "incomplete" | "unsupported-number";
};

/** Every number written by the model must already exist in the facts. */
export function numbersAreSupported(candidate: string, facts: string): boolean {
  const tokens = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((t) => t.replace(/,/g, ""));
  const allowed = new Set(tokens(facts));
  const allowedNumeric = new Set([...allowed].map((n) => String(Number(n))));

  for (const token of tokens(candidate)) {
    const normalized = String(Number(token));
    if (!allowed.has(token) && !allowedNumeric.has(normalized)) return false;
  }
  return true;
}

const cache = new Map<string, { text: string; at: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

// When the AI is down (503 / daily quota), don't hammer it on every page
// load — the free tier allows only 20 requests per model per day. A short
// backoff keeps the page instant and leaves the quota for Smart Entry.
const failures = new Map<string, number>();
const FAILURE_BACKOFF_MS = 3 * 60 * 1000;

/** Keep only whole sentences, and never more than 600 characters. */
export function tidyNarration(text: string): string | null {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]*[.!?]/g);
  if (!sentences || sentences.length === 0) return null;

  let out = "";
  for (const sentence of sentences) {
    const next = `${out} ${sentence}`.trim();
    if (next.length > 600) break;
    out = next;
  }

  return out.length >= 40 ? out : null;
}

export async function narrateGrowthPlan(userId: string): Promise<GrowthNarration> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { text: cached.text, source: "ai" };
  }

  const plan = await getGrowthPlan(userId);
  const facts = growthFactsForNarration(plan);
  const fallback: GrowthNarration = { text: plan.summary, source: "deterministic" };

  if (plan.recommendations.length === 0) {
    return { ...fallback, reason: "empty-plan" };
  }

  const failedAt = failures.get(userId);
  if (failedAt && Date.now() - failedAt < FAILURE_BACKOFF_MS) {
    return { ...fallback, reason: "ai-failed" };
  }

  let text: string;
  try {
    text = await generateNarration(
      SYSTEM_INSTRUCTION,
      `FACTS:\n${facts}\n\nRewrite these facts for the shop owner.`,
    );
  } catch (error) {
    console.warn(
      `[growth:narration] AI call failed: ${error instanceof Error ? error.message.slice(0, 140) : String(error)}`,
    );
    failures.set(userId, Date.now());
    return { ...fallback, reason: "ai-failed" };
  }

  const clean = tidyNarration(text);
  if (!clean) {
    console.warn(`[growth:narration] answer had no complete sentence: ${JSON.stringify(text.slice(0, 140))}`);
    failures.set(userId, Date.now());
    return { ...fallback, reason: "incomplete" };
  }

  if (!numbersAreSupported(clean, facts)) {
    console.warn(`[growth:narration] rejected an answer with unsupported numbers: ${JSON.stringify(clean.slice(0, 200))}`);
    failures.set(userId, Date.now());
    return { ...fallback, reason: "unsupported-number" };
  }

  failures.delete(userId);
  cache.set(userId, { text: clean, at: Date.now() });
  return { text: clean, source: "ai" };
}
