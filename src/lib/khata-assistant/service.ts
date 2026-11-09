/**
 * Khata Assistant service — the single entry point for the feature.
 *
 * READ-ONLY by construction: this module imports the query engine and the
 * fact loaders, and never the action layer. Asking it to change data returns a
 * message pointing at the Universal Voice Assistant instead.
 *
 * Flow:
 *   prepared question  → run the handler (no AI)
 *   typed question     → deterministic match (no AI) → else AI classification
 *                        → run the handler → optional AI re-wording
 *   change request     → explain that this feature only reports
 */

import { detectSpeechLanguage } from "@/lib/assistant/language";
import { BadRequestError } from "@/lib/errors";
import { loadKhataFacts } from "./facts";
import { actionGuidanceAnswer, guidanceAnswer, runIntent } from "./engine";
import { classifyQuestion, explainAnswer } from "./ai";
import { matchCustomQuestion, detectActionRequest } from "./match";
import {
  CATEGORY_ORDER,
  KHATA_CATEGORIES,
  PREPARED_QUESTIONS,
  categoryLabel,
  getPreparedQuestion,
  isPreparedQuestionId,
  questionLabel,
} from "./questions";
import type {
  KhataAskInput,
  KhataLanguage,
  KhataQuestionId,
  KhataReply,
} from "./types";

const VALID_LANGUAGES: KhataLanguage[] = ["en", "ur", "roman-ur", "mixed"];

function isKhataLanguage(value: unknown): value is KhataLanguage {
  return typeof value === "string" && (VALID_LANGUAGES as string[]).includes(value);
}

function resolveLanguage(input: KhataAskInput, text: string): KhataLanguage {
  // The server is authoritative: detect from the text the owner actually sent.
  if (text) {
    const detected = detectSpeechLanguage(text);
    // The typed Khata assistant's phrase templates are English/Urdu only;
    // Pashto is fully supported by the Voice Assistant (model-generated).
    return detected === "ps" ? "ur" : detected;
  }
  if (isKhataLanguage(input.language)) return input.language;
  return "en";
}

export type AskOptions = {
  /** Set false in tests to keep answers deterministic (no AI calls). */
  useAi?: boolean;
};

export async function askKhataAssistant(
  userId: string,
  input: KhataAskInput,
  options: AskOptions = {},
): Promise<KhataReply> {
  const useAi = options.useAi ?? true;
  const questionIdRaw = (input.questionId ?? "").trim();
  const text = (input.text ?? "").trim();

  if (!questionIdRaw && !text) {
    throw new BadRequestError("khata.ask.empty");
  }

  const language = resolveLanguage(input, text);

  // ── Prepared question: no AI, pure records ──────────────────────────────
  if (questionIdRaw) {
    if (!isPreparedQuestionId(questionIdRaw)) {
      throw new BadRequestError("khata.ask.unknownQuestion");
    }
    const id = questionIdRaw as KhataQuestionId;
    const question = questionLabel(getPreparedQuestion(id)!, language);
    const facts = await loadKhataFacts(userId);
    return runIntent(facts, id, question, language);
  }

  // ── Typed question ──────────────────────────────────────────────────────
  if (detectActionRequest(text)) {
    return actionGuidanceAnswer(language, text);
  }

  let intent = matchCustomQuestion(text);

  if (!intent && useAi) {
    const classified = await classifyQuestion(text);
    if (classified.intent !== "unknown") intent = classified.intent;
  }

  if (!intent) {
    return guidanceAnswer(language, text);
  }

  const facts = await loadKhataFacts(userId);
  const answer = await runIntent(facts, intent, text, language);

  // Re-word the answer in the owner's words — best effort, never adds figures.
  if (useAi) {
    const explanation = await explainAnswer(answer, language);
    if (explanation) {
      // Keep the computed headline and figures as the source of truth; the AI
      // only adds a subordinate sentence.
      return { ...answer, explanation, source: "database+ai" };
    }
  }
  return answer;
}

// ────────────────────────────────────────────────────────────────────────────
// Catalogue (used by the GET route and tests)
// ────────────────────────────────────────────────────────────────────────────

export type KhataCatalog = {
  language: KhataLanguage;
  categories: Array<{
    id: string;
    label: string;
    questions: Array<{ id: KhataQuestionId; label: string }>;
  }>;
};

export function getKhataCatalog(language: KhataLanguage = "en"): KhataCatalog {
  return {
    language,
    categories: CATEGORY_ORDER.map((id) => {
      const category = KHATA_CATEGORIES.find((c) => c.id === id)!;
      return {
        id,
        label: categoryLabel(category, language),
        questions: PREPARED_QUESTIONS.filter((q) => q.category === id).map((q) => ({
          id: q.id,
          label: questionLabel(q, language),
        })),
      };
    }),
  };
}
