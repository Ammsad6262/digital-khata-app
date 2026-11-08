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
  const { lang } = useLanguage();
  const assistant = useKhataAssistant();
  const [input, setInput] = useState("");
  const [detected, setDetected] = useState<UiLanguage>("en");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { open, setOpen, answer, busy, error } = assistant;

  // Prepared questions follow the app language, or the language the owner last
  // used when they typed a question.
  const uiLanguage: UiLanguage = detected === "roman-ur" || detected === "ur" ? detected : lang;

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
    void assistant.askText(text).then(() => undefined);
  }, [assistant, busy, input]);

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
        aria-label="Open the Khata Assistant"
        className={cn(
          "fixed bottom-24 right-20 z-40 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-ink text-white shadow-lg",
          "transition-transform hover:scale-105 active:scale-95",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <BarChart3 className="h-6 w-6" />}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Khata Assistant"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl",
            "sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[440px] sm:rounded-3xl",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Khata Assistant</p>
              <p className="text-xs text-ink-subtle">
                Understand your business from your own records
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-2"
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
          <div className="flex items-end gap-2 border-t border-line p-3">
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
              placeholder="Ask about your business…"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={busy || input.trim().length === 0}
              aria-label="Ask"
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white",
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

function AssistantBody({
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
}) {
  if (busy && !answer) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-ink-subtle">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>Checking your records…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 py-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm text-danger-ink">{error}</p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => assistant.retry()}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => assistant.reset()}
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (answer) {
    return <AnswerView answer={answer} onAskAnother={() => assistant.reset()} />;
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
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Tap a question to see the answer from your business data. You can also type your own
        question below.
      </p>

      {CATEGORY_ORDER.map((categoryId) => {
        const category = KHATA_CATEGORIES.find((c) => c.id === categoryId)!;
        return (
          <div key={categoryId} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {categoryLabel(category, uiLanguage)}
            </p>
            <div className="space-y-1.5">
              {questionsByCategory(categoryId).map((question) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => onQuestion(question.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left text-sm",
                    "text-ink transition-colors hover:border-brand-300 hover:bg-brand-50",
                  )}
                >
                  <span>{questionLabel(question, uiLanguage)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnswerView({ answer, onAskAnother }: { answer: KhataAnswer; onAskAnother: () => void }) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onAskAnother}
        className="flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Ask another question
      </button>

      {answer.question ? <p className="text-sm font-semibold text-ink">{answer.question}</p> : null}

      <p className="text-sm leading-relaxed text-ink-muted">{answer.headline}</p>

      {answer.explanation ? (
        <p className="text-xs leading-relaxed text-ink-subtle">{answer.explanation}</p>
      ) : null}

      {answer.figures.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {answer.figures.map((figure, index) => (
            <div key={`${figure.label}-${index}`} className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-[11px] text-ink-subtle">{figure.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{figure.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {answer.rows.length > 0 ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {answer.rows.slice(0, 12).map((row, index) => (
            <li
              key={`${row.label}-${index}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-ink">{row.label}</span>
              <span className="shrink-0 text-right">
                {row.value ? <span className="font-medium text-ink">{row.value}</span> : null}
                {row.meta ? (
                  <span className="block text-[11px] text-ink-subtle">{row.meta}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {answer.notes.length > 0 ? (
        <div className="space-y-1.5 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-ink">
          {answer.notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        </div>
      ) : null}

      {answer.nextStep ? (
        <p className="flex items-start gap-1.5 text-xs text-ink-subtle">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
          {answer.nextStep}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onAskAnother}
        className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white"
      >
        Ask another question
      </button>
    </div>
  );
}
