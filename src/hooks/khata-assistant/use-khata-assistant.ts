"use client";

/**
 * useKhataAssistant — client state for the Khata Assistant.
 *
 * One question in, one structured answer out. No conversation history is kept
 * (the feature is question → answer), and nothing here can change data.
 */

import { useCallback, useRef, useState } from "react";
import type { KhataAnswer, KhataAskInput } from "@/lib/khata-assistant/types";
import { useLanguage } from "@/providers/language-provider";
import { localizeMessage } from "@/lib/i18n/message";

type AskInput = Pick<KhataAskInput, "questionId" | "text" | "language">;

export function useKhataAssistant() {
  const { t, tParams } = useLanguage();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<KhataAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAsk = useRef<AskInput | null>(null);

  const ask = useCallback(async (input: AskInput) => {
    lastAsk.current = input;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/khata-assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: KhataAnswer;
        error?: { message?: string };
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error?.message || "khata.ask.failed");
      }
      setAnswer(json.data);
    } catch (err) {
      const raw =
        err instanceof Error ? err.message : "khata.ask.somethingWrong";
      setError(localizeMessage(raw, t, tParams));
    } finally {
      setBusy(false);
    }
  }, [t, tParams]);

  const askQuestion = useCallback(
    (questionId: string, language?: string) => ask({ questionId, language }),
    [ask],
  );

  const askText = useCallback(
    (text: string, language?: string) => ask({ text, language }),
    [ask],
  );

  const retry = useCallback(() => {
    if (lastAsk.current) void ask(lastAsk.current);
  }, [ask]);

  const reset = useCallback(() => {
    setAnswer(null);
    setError(null);
  }, []);

  return {
    open,
    setOpen,
    answer,
    busy,
    error,
    askQuestion,
    askText,
    retry,
    reset,
  };
}
