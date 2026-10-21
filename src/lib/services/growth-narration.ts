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

export async function narrateGrowthPlan(userId: string): Promise<GrowthNarration> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { text: cached.text, source: "ai" };
  }

  const plan = await getGrowthPlan(userId);
  const facts = growthFactsForNarration(plan);
  const fallback: GrowthNarration = { text: plan.summary, source: "deterministic" };

  if (plan.recommendations.length === 0) return fallback;

  try {
    const text = await generateNarration(
      SYSTEM_INSTRUCTION,
      `FACTS:\n${facts}\n\nRewrite these facts for the shop owner.`,
    );

    const clean = text.replace(/\s+/g, " ").trim();

    if (!clean || clean.length > 600) return fallback;
    // A cut-off answer is worse than no answer: require at least one
    // complete sentence and no dangling ending.
    if (clean.length < 40 || !/[.!?]$/.test(clean)) return fallback;
    if (!numbersAreSupported(clean, facts)) return fallback;

    cache.set(userId, { text: clean, at: Date.now() });
    return { text: clean, source: "ai" };
  } catch {
    return fallback;
  }
}
