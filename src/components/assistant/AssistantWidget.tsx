"use client";

/**
 * AssistantWidget — the application-wide "Khata Assistant" (chat product).
 *
 * This is the typed assistant: prepared example commands, a conversation, and
 * confirmation cards. It is a SEPARATE product from the Universal Voice
 * Assistant (`src/components/voice-assistant/VoiceAssistant.tsx`):
 *
 *   - Voice Assistant  = tap the mic, speak naturally, confirm.
 *   - Khata Assistant  = type / tap a prepared command, read answers.
 *
 * Both share the same backend engine, but neither shows developer details
 * (model names, counters, provider info). Those are behind `/admin/diagnostics`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  useAssistant,
  type AssistantTurn,
} from "@/hooks/assistant/use-assistant";
import type { AssistantReply, PlanPayload } from "@/lib/assistant/types";
import { PlanCard } from "@/components/assistant/PlanCard";

export function AssistantWidget() {
  const assistant = useAssistant();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const busy = assistant.busy;
  const refreshStatus = assistant.refreshStatus;

  useEffect(() => {
    if (open) void refreshStatus();
  }, [open, refreshStatus]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [assistant.turns, open]);

  const handleSendText = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void assistant.send({ text });
  }, [assistant, busy, input]);

  const statusLabel = assistant.state !== "idle" ? "Working…" : "Ready";

  return (
    <>
      {/* Launcher (sits beside the Voice Assistant so the two are distinct). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open the Khata Assistant"
        className={cn(
          "fixed bottom-24 right-20 z-40 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-neutral-900 text-white shadow-lg dark:bg-white dark:text-neutral-900",
          "transition-transform hover:scale-105 active:scale-95",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Khata Assistant"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col overflow-hidden rounded-t-3xl border border-neutral-200 bg-white shadow-2xl",
            "sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[440px] sm:rounded-3xl",
            "dark:border-neutral-800 dark:bg-neutral-900",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Khata Assistant
              </p>
              <p className="text-xs text-neutral-500">{statusLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => assistant.reset()}
              className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {assistant.turns.length === 0 ? (
              <div className="space-y-2 text-sm text-neutral-500">
                <p className="font-medium text-neutral-700 dark:text-neutral-200">
                  Type or tap a business command.
                </p>
                <ul className="space-y-1">
                  <li>“Ali bought 20 cartons of rice, paid 15,000”</li>
                  <li>“received 5,000 from Ali”</li>
                  <li>“spent 500 on electricity”</li>
                  <li>“add customer Imran”</li>
                  <li>“who owes me money?”</li>
                  <li>“how much stock of rice?”</li>
                  <li>“remind me to call Ali tomorrow”</li>
                </ul>
              </div>
            ) : null}

            {assistant.turns.map((turn) => (
              <TurnView
                key={turn.id}
                turn={turn}
                busy={busy}
                onConfirm={(id, patch) => void assistant.confirm(id, patch)}
                onCancel={(id) => void assistant.cancel(id)}
                onEdit={(text) => setInput(text)}
              />
            ))}

            {busy ? (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {statusLabel}
              </div>
            ) : null}
          </div>

          <div className="flex items-end gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              rows={1}
              placeholder="Type a command..."
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
            <button
              type="button"
              onClick={handleSendText}
              disabled={busy || input.trim().length === 0}
              aria-label="Send"
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

function TurnView({
  turn,
  busy,
  onConfirm,
  onCancel,
  onEdit,
}: {
  turn: AssistantTurn;
  busy: boolean;
  onConfirm: (actionId: string, patch: Partial<PlanPayload>) => void;
  onCancel: (actionId: string) => void;
  onEdit: (text: string) => void;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2">
        <ReplyView
          reply={turn.reply}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onEdit={onEdit}
        />
      </div>
    </div>
  );
}

function ReplyView({
  reply,
  busy,
  onConfirm,
  onCancel,
  onEdit,
}: {
  reply: AssistantReply;
  busy: boolean;
  onConfirm: (actionId: string, patch: Partial<PlanPayload>) => void;
  onCancel: (actionId: string) => void;
  onEdit: (text: string) => void;
}) {
  if (reply.kind === "answer") {
    return (
      <div className="rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
        <p>{reply.text}</p>
        {reply.items && reply.items.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {reply.items.slice(0, 12).map((item, index) => (
              <li key={index} className="flex items-center justify-between gap-2 text-xs">
                {item.href ? (
                  <a
                    href={item.href}
                    className="truncate font-medium text-brand-700 hover:underline dark:text-brand-400"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className="truncate font-medium">{item.label}</span>
                )}
                <span className="shrink-0 text-neutral-500">
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
      <div className="rounded-2xl rounded-bl-sm bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <p>{reply.text}</p>
        {reply.options && reply.options.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reply.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onEdit(option.name)}
                className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium dark:border-amber-800 dark:bg-amber-900/30"
              >
                {option.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (reply.kind === "error") {
    return (
      <div className="rounded-2xl rounded-bl-sm bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-100">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{reply.text}</p>
            {reply.retryAt ? (
              <p className="mt-1 text-xs opacity-80">
                Try again after {new Date(reply.retryAt).toLocaleTimeString()}.
              </p>
            ) : null}
            {reply.preservedText ? (
              <button
                type="button"
                onClick={() => onEdit(reply.preservedText)}
                className="mt-1 text-xs font-medium underline"
              >
                Edit and resend “{reply.preservedText.slice(0, 40)}”
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return <PlanCard plan={reply} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />;
}
