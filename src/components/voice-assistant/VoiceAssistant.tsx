"use client";

/**
 * VoiceAssistant — the Universal Voice Assistant.
 *
 * The original speech-first experience, restored and extended to every module.
 * It is a SEPARATE product from the typed Khata Assistant:
 *
 * Tap the mic → speak naturally → see the transcript → correct it if needed
 * → the shared engine answers or prepares a plan → confirm to save.
 *
 * It never shows Gemini model names, per-model counters, or provider details.
 * The microphone language is detected automatically; there is no dropdown.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Mic, MicOff, RotateCcw, Send, Square, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useVoiceAssistant } from "@/hooks/voice-assistant/use-voice-assistant";
import { PlanCard } from "@/components/assistant/PlanCard";
import { languageLabel } from "@/lib/assistant/language";
import { useLanguage } from "@/providers/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { AssistantReply, PlanPayload } from "@/lib/assistant/types";

type Phase =
  | "idle"
  | "listening"
  | "understanding"
  | "executing"
  | "confirm"
  | "clarify"
  | "failed"
  | "completed";

const PHASE_KEY: Record<Phase, TranslationKey> = {
  idle: "assistant.phase.ready",
  listening: "assistant.phase.listening",
  understanding: "assistant.phase.understanding",
  executing: "assistant.phase.executing",
  confirm: "assistant.phase.confirm",
  clarify: "assistant.phase.clarify",
  failed: "assistant.phase.failed",
  completed: "assistant.phase.completed",
};

const EXAMPLE_KEYS: TranslationKey[] = [
  "assistant.example1",
  "assistant.example2",
  "assistant.example3",
  "assistant.example4",
  "assistant.example5",
  "assistant.example6",
];

export function VoiceAssistant() {
  const { t } = useLanguage();
  const voice = useVoiceAssistant();
  const { assistant, speech, recorder } = voice;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const busy = assistant.busy;
  const refreshStatus = assistant.refreshStatus;

  useEffect(() => {
    if (open) void refreshStatus();
  }, [open, refreshStatus]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [assistant.turns, open, voice.transcript]);

  const lastReply = useMemo<AssistantReply | null>(() => {
    for (let i = assistant.turns.length - 1; i >= 0; i--) {
      const turn = assistant.turns[i]!;
      if (turn.role === "assistant") return turn.reply;
    }
    return null;
  }, [assistant.turns]);

  const phase = useMemo<Phase>(() => {
    if (voice.listening) return "listening";
    if (assistant.state === "understanding" || assistant.state === "transcribing") {
      return "understanding";
    }
    if (assistant.state === "executing") return "executing";
    if (!lastReply) return "idle";
    if (lastReply.kind === "plan") return "confirm";
    if (lastReply.kind === "clarify") return "clarify";
    if (lastReply.kind === "error") return "failed";
    return "completed";
  }, [assistant.state, lastReply, voice.listening]);

  const handleMic = useCallback(() => {
    if (busy) return;
    if (voice.listening) voice.stop();
    else voice.start();
  }, [busy, voice]);

  const handleTyped = useCallback(() => {
    const text = typed.trim();
    if (!text || busy) return;
    setTyped("");
    voice.submit(text);
  }, [busy, typed, voice]);

  const micError = speech.error?.message ?? recorder.error ?? null;
  const hasConversation = assistant.turns.length > 0;

  return (
    <>
      {/* Launcher — the primary, app-wide assistant. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("assistant.voiceOpen")}
        className={cn(
          "fixed bottom-24 end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg",
          "transition-transform hover:scale-105 active:scale-95",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        {voice.listening ? (
          <span className="absolute -end-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-danger" />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("assistant.voiceTitle")}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl",
            "sm:inset-x-auto sm:end-4 sm:bottom-4 sm:w-[440px] sm:rounded-3xl",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Mic className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t("assistant.voiceTitle")}</p>
              <p className="truncate text-xs text-ink-subtle" aria-live="polite">
                {t(PHASE_KEY[phase])}
                {voice.detected !== "en" || voice.transcript
                  ? ` · ${languageLabel(voice.detected)}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => voice.reset()}
              aria-label={t("assistant.clearChat")}
              className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-2"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {!hasConversation ? (
              <div className="space-y-2 text-sm text-ink-subtle">
                <p className="font-medium text-ink-muted">{t("assistant.introSpeak")}</p>
                <ul className="space-y-1 text-xs">
                  {EXAMPLE_KEYS.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
                <p className="pt-1 text-xs">{t("assistant.introLangs")}</p>
              </div>
            ) : null}

            {assistant.turns.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-ee-sm bg-brand-600 px-3 py-2 text-sm text-white">
                    {turn.text}
                  </div>
                </div>
              ) : (
                <div key={turn.id} className="flex justify-start">
                  <div className="max-w-[92%]">
                    <VoiceReply
                      reply={turn.reply}
                      busy={busy}
                      onConfirm={(id, patch) => void assistant.confirm(id, patch)}
                      onCancel={(id) => void assistant.cancel(id)}
                      onRetry={(text) => voice.retry(text)}
                      onEdit={(text) => voice.setTranscript(text)}
                    />
                  </div>
                </div>
              ),
            )}

            {busy ? (
              <div className="flex items-center gap-2 text-sm text-ink-subtle">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t(PHASE_KEY[phase])}
              </div>
            ) : null}
          </div>

          {/* Live transcript while listening */}
          {voice.listening ? (
            <div className="border-t border-line px-4 py-2 text-sm">
              <span className="text-ink-faint">{t("assistant.youSaid")}{" "}</span>
              <span className="text-ink">{speech.interim || speech.transcript || "…"}</span>
            </div>
          ) : null}

          {/* Correctable transcript */}
          {voice.transcript && !voice.listening && !busy ? (
            <div className="border-t border-line px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-subtle">
                  {t("assistant.iHeard")} · {languageLabel(voice.detected)}
                </p>
                <p
                  className={cn(
                    "text-[11px]",
                    speech.lowConfidence ? "text-warning-ink" : "text-ink-faint",
                  )}
                >
                  {speech.lowConfidence
                    ? t("assistant.lowConfidence")
                    : t("assistant.correctIfNeeded")}
                </p>
              </div>
              <textarea
                value={voice.transcript}
                onChange={(e) => voice.setTranscript(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
                aria-label={t("assistant.transcript")}
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => voice.submit()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  <Send className="h-4 w-4" />
                  {t("assistant.send")}
                </button>
                <button
                  type="button"
                  onClick={() => voice.start()}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-line-strong px-3 py-2 text-sm font-medium"
                >
                  <Mic className="h-4 w-4" />
                  {t("assistant.rerecord")}
                </button>
              </div>
            </div>
          ) : null}

          {micError && !voice.listening ? (
            <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-xs text-warning-ink">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {micError}
            </div>
          ) : null}

          {/* Mic + typed fallback */}
          <div className="border-t border-line p-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleMic}
                disabled={busy}
                aria-label={voice.listening ? t("assistant.stopListening") : t("assistant.startListening")}
                className={cn(
                  "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white transition-colors",
                  voice.listening ? "bg-danger" : "bg-brand-600 hover:bg-brand-700",
                  busy && "opacity-50",
                )}
              >
                {voice.listening ? (
                  <Square className="h-6 w-6" />
                ) : speech.supported ? (
                  <Mic className="h-7 w-7" />
                ) : (
                  <MicOff className="h-7 w-7" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {voice.listening
                    ? t("assistant.listeningTapStop")
                    : busy
                      ? t(PHASE_KEY[phase])
                      : t("assistant.tapToSpeak")}
                </p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {speech.supported
                    ? t("assistant.wordsFirst")
                    : t("assistant.browserRecording")}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleTyped();
                  }
                }}
                placeholder={t("assistant.typeCommand")}
                className="min-h-11 flex-1 rounded-2xl border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={handleTyped}
                disabled={busy || typed.trim().length === 0}
                aria-label={t("assistant.sendTyped")}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white",
                  (busy || typed.trim().length === 0) && "opacity-40",
                )}
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function VoiceReply({
  reply,
  busy,
  onConfirm,
  onCancel,
  onRetry,
  onEdit,
}: {
  reply: AssistantReply;
  busy: boolean;
  onConfirm: (actionId: string, patch: Partial<PlanPayload>) => void;
  onCancel: (actionId: string) => void;
  onRetry: (text: string) => void;
  onEdit: (text: string) => void;
}) {
  const { t, tParams } = useLanguage();

  if (reply.kind === "answer") {
    return (
      <div className="rounded-2xl rounded-es-sm bg-surface-2 px-3 py-2 text-sm text-ink">
        <p>{reply.text}</p>
        {reply.items && reply.items.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {reply.items.slice(0, 8).map((item, index) => (
              <li key={index} className="flex items-center justify-between gap-2 text-xs">
                {item.href ? (
                  <a
                    href={item.href}
                    className="truncate font-medium text-brand-700 hover:underline"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className="truncate font-medium">{item.label}</span>
                )}
                <span className="shrink-0 text-ink-subtle">
                  {item.value}
                  {item.meta ? ` · ${item.meta}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (reply.kind === "clarify") {
    return (
      <div className="rounded-2xl rounded-es-sm bg-warning-soft px-3 py-2 text-sm text-warning-ink">
        <p>{reply.text}</p>
        {reply.options && reply.options.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reply.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onEdit(option.name)}
                className="rounded-full border border-warning bg-surface px-2.5 py-1 text-xs font-medium"
              >
                {option.name}
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-1.5 text-[11px] opacity-80">{t("assistant.tapNameHint")}</p>
      </div>
    );
  }

  if (reply.kind === "error") {
    return (
      <div className="rounded-2xl rounded-es-sm bg-danger-soft px-3 py-2 text-sm text-danger-ink">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{reply.text}</p>
            {reply.retryAt ? (
              <p className="mt-1 text-xs opacity-80">
                {tParams("assistant.tryAgainAfter", {
                  time: new Date(reply.retryAt).toLocaleTimeString(),
                })}
              </p>
            ) : null}
            {reply.preservedText ? (
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => onRetry(reply.preservedText)}
                  className="rounded-full bg-danger px-2.5 py-1 text-xs font-semibold text-white"
                >
                  {t("assistant.retry")}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(reply.preservedText)}
                  className="rounded-full border border-danger px-2.5 py-1 text-xs font-medium"
                >
                  Edit
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return <PlanCard plan={reply} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />;
}
