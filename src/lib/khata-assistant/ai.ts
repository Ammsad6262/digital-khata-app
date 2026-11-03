/**
 * AI helpers for the Khata Assistant.
 *
 * The AI plays exactly two, tightly-scoped roles:
 *
 *   1. CLASSIFY — map an unrecognised free-text question onto one of the
 *      known data questions. It returns a label, never a number.
 *   2. EXPLAIN — re-word an answer the backend already computed, in the
 *      owner's language. The prompt forbids adding any figure that is not in
 *      the supplied facts.
 *
 * Neither function can reach the database, and both are optional: when the
 * free Gemini tier is exhausted or misconfigured the deterministic answer is
 * returned untouched. The AI can improve the wording; it can never invent a
 * number, a customer or a product.
 */

import { generateStructured, generateText } from "@/lib/ai/gemini-client";
import { PREPARED_QUESTIONS } from "./questions";
import type { KhataAnswer, KhataLanguage, KhataQuestionId } from "./types";

/** A known data question, or the extra "compare two periods" intent. */
export type KhataIntent = KhataQuestionId | "compare_periods" | "unknown";

export const KHATA_INTENTS: KhataIntent[] = [
  ...PREPARED_QUESTIONS.map((q) => q.id),
  "compare_periods",
  "unknown",
];

function languageName(language: KhataLanguage): string {
  switch (language) {
    case "ur":
      return "Urdu (Arabic script)";
    case "roman-ur":
      return "Roman Urdu (Urdu written with English letters)";
    default:
      return "English";
  }
}

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    questionId: {
      type: "string",
      enum: KHATA_INTENTS,
      description: "The single prepared question that best matches the user's question.",
    },
  },
  required: ["questionId"],
  additionalProperties: false,
} as const;

const QUESTION_MENU = PREPARED_QUESTIONS.map(
  (q) => `${q.id}: ${q.labels.en}`,
).join("\n");

/**
 * Best-effort classification of a free-text question into a known intent.
 * Returns "unknown" when the model is unavailable or unsure — callers must
 * still answer without inventing data.
 */
export async function classifyQuestion(
  text: string,
): Promise<{ intent: KhataIntent; model?: string }> {
  try {
    const { value, model } = await generateStructured<{ questionId: KhataIntent }>({
      systemInstruction: [
        "You map a wholesale shop owner's business question onto one prepared analysis question.",
        "Choose the single best match from the menu. If none fits, answer \"unknown\".",
        "Never answer the question itself and never output numbers.",
        "",
        "Menu:",
        QUESTION_MENU,
        "compare_periods: Compare one period with another (e.g. this month vs last month).",
      ].join("\n"),
      contents: text,
      responseSchema: CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0,
      requestTag: "khata.classify",
      maxOutputRetries: 1,
      parse: (raw) => {
        const id = (raw as { questionId?: unknown })?.questionId;
        return {
          questionId:
            typeof id === "string" && (KHATA_INTENTS as string[]).includes(id)
              ? (id as KhataIntent)
              : "unknown",
        };
      },
    });
    return { intent: value.questionId, model };
  } catch {
    return { intent: "unknown" };
  }
}

/** Facts the model is allowed to use, serialised with no extra numbers. */
function factsForPrompt(answer: KhataAnswer): string {
  const lines = [answer.headline];
  for (const f of answer.figures) lines.push(`${f.label}: ${f.value}`);
  for (const r of answer.rows) {
    lines.push(`${r.label}${r.value ? `: ${r.value}` : ""}${r.meta ? ` (${r.meta})` : ""}`);
  }
  return lines.join("\n");
}

/**
 * Re-word an already-computed answer in the owner's language. Returns null on
 * any AI failure so the caller keeps the deterministic wording.
 */
export async function explainAnswer(
  answer: KhataAnswer,
  language: KhataLanguage,
): Promise<string | null> {
  if (!answer.headline) return null;
  try {
    const { text } = await generateText({
      systemInstruction: [
        "You are a plain-spoken business analyst inside a shop-keeping app.",
        `Reply ONLY in ${languageName(language)}.`,
        "You are given facts the app already calculated. Write 1-3 short sentences that explain them to a shop owner.",
        "Do not repeat the headline word for word; add useful interpretation the owner can act on.",
        "STRICT: do not add any number, customer name, or product name that is not in the facts.",
        "Do not give investment, tax or legal advice. Do not promise outcomes.",
      ].join("\n"),
      prompt: factsForPrompt(answer),
      temperature: 0.2,
      maxOutputTokens: 320,
      requestTag: "khata.explain",
    });
    const cleaned = text.replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}
