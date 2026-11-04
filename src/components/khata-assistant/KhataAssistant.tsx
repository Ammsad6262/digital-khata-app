"use client";

/**
 * KhataAssistant — the business-intelligence product.
 *
 * This is NOT the Universal Voice Assistant. It never speaks, never acts, and
 * never changes a record. It answers 20 prepared business questions (plus typed
 * ones) using the owner's own data, and it is a separate launcher and panel.
 *
 * No developer details appear here: no model names, no quotas, no provider
 * information. Those live behind the authenticated /admin/diagnostics area.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import { useKhataAssistant } from "@/hooks/khata-assistant/use-khata-assistant";
import {
  CATEGORY_ORDER,
  KHATA_CATEGORIES,
  categoryLabel,
  questionLabel,
  questionsByCategory,
} from "@/lib/khata-assistant/questions";
import type { KhataAnswer } from "@/lib/khata-assistant/types";

type UiLanguage = "en" | "ur" | "roman-ur" | "mixed";

export function KhataAssistant() {
  const { lang, t } = useLanguage();
  const assistant = useKhataAssistant();
  const [input, setInput] = useState("");
  const [detected, setDetected] = useState<UiLanguage>("en");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { open, setOpen, answer, busy, error } = assistant;

  // Prepared questions follow the app language, or the language the owner last
  // used when they typed a question.
  const uiLanguage: UiLanguage =
    detected === "roman-ur" || detected === "ur" ? detected : lang;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [answer, busy]);

  const handleQuestion = useCallback(
    (questionId: string) => {
      setDetected(lang === "ur" ? "ur" : "en");
      void assistant.askQuestion(questionId, lang);
    },
    [assistant, lang],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void assistant.askText(text, lang).then(() => undefined);
  }, [assistant, busy, input, lang]);

  // Keep the language chip in sync with the answered question's language.
  useEffect(() => {
    if (answer) setDetected(answer.language);
  }, [answer]);

  return (
    <>
      {/* Launcher — sits beside the Voice Assistant so the two stay distinct. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("khataAssistant.open")}
        className={cn(
          "relative pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full",
          "bg-neutral-900 text-white shadow-lg dark:bg-white dark:text-neutral-900",
          "transition-transform hover:scale-105 active:scale-95",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <BarChart3 className="h-6 w-6" />}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("khataAssistant.title")}
          className={cn(
            "pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col overflow-hidden rounded-t-3xl border border-neutral-200 bg-white shadow-2xl",
            "sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[440px] sm:rounded-3xl",
            "dark:border-neutral-800 dark:bg-neutral-900",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {t("khataAssistant.title")}
              </p>
              <p className="text-xs text-neutral-500">
                {t("khataAssistant.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
            <AssistantBody
              answer={answer}
              busy={busy}
              error={error}
              assistant={assistant}
              uiLanguage={uiLanguage}
              onQuestion={handleQuestion}
            />
          </div>

          {/* Ask your own */}
          <div className="flex items-end gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={t("khataAssistant.placeholder")}
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={busy || input.trim().length === 0}
              aria-label={t("khataAssistant.ask")}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900",
                (busy || input.trim().length === 0) && "opacity-40",
              )}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function AssistantBody(
  {
    answer,
    busy,
    error,
    assistant,
    uiLanguage,
    onQuestion,
  }: {
    answer: KhataAnswer | null;
    busy: boolean;
    error: string | null;
    assistant: ReturnType<typeof useKhataAssistant>;
    uiLanguage: UiLanguage;
    onQuestion: (id: string) => void;
  },
) {
  const { t } = useLanguage();

  if (busy && !answer) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-neutral-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>{t("khataAssistant.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 py-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/50">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => assistant.retry()}
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            {t("common.retry")}
          </button>
          <button
            type="button"
            onClick={() => assistant.reset()}
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
          >
            {t("common.back")}
          </button>
        </div>
      </div>
    );
  }

  if (answer) {
    return (
      <AnswerView
        answer={answer}
        onAskAnother={() => assistant.reset()}
      />
    );
  }

  return <QuestionList uiLanguage={uiLanguage} onQuestion={onQuestion} />;
}

function QuestionList({
  uiLanguage,
  onQuestion,
}: {
  uiLanguage: UiLanguage;
  onQuestion: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        {t("khataAssistant.intro")}
      </p>

      {CATEGORY_ORDER.map((categoryId) => {
        const category = KHATA_CATEGORIES.find((c) => c.id === categoryId)!;
        return (
          <div key={categoryId} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {categoryLabel(category, uiLanguage)}
            </p>
            <div className="space-y-1.5">
              {questionsByCategory(categoryId).map((question) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => onQuestion(question.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-left text-sm",
                    "text-neutral-800 transition-colors hover:border-brand-300 hover:bg-brand-50",
                    "dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-100 dark:hover:border-brand-700 dark:hover:bg-brand-950/40",
                  )}
                >
                  <span>{questionLabel(question, uiLanguage)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnswerView({
  answer,
  onAskAnother,
}: {
  answer: KhataAnswer;
  onAskAnother: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onAskAnother}
        className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("khataAssistant.askAnother")}
      </button>

      {answer.question ? (
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {answer.question}
        </p>
      ) : null}

      <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
        {answer.headline}
      </p>

      {answer.explanation ? (
        <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {answer.explanation}
        </p>
      ) : null}

      {answer.figures.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {answer.figures.map((figure, index) => (
            <div
              key={`${figure.label}-${index}`}
              className="rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60"
            >
              <p className="text-[11px] text-neutral-500">{figure.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {figure.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {answer.rows.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {answer.rows.slice(0, 12).map((row, index) => (
            <li
              key={`${row.label}-${index}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-neutral-800 dark:text-neutral-100">
                {row.label}
              </span>
              <span className="shrink-0 text-right">
                {row.value ? (
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {row.value}
                  </span>
                ) : null}
                {row.meta ? (
                  <span className="block text-[11px] text-neutral-500">
                    {row.meta}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {answer.notes.length > 0 ? (
        <div className="space-y-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {answer.notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        </div>
      ) : null}

      {answer.nextStep ? (
        <p className="flex items-start gap-1.5 text-xs text-neutral-500">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
          {answer.nextStep}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onAskAnother}
        className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        {t("khataAssistant.askAnother")}
      </button>
    </div>
  );
}
