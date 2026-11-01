"use client";

/**
 * AssistantWidget — the application-wide "Khata Assistant".
 *
 * One launcher, one conversation, available on every signed-in page (not just
 * the dashboard). It replaces the dashboard-only voice button so the owner can
 * act on any module by speaking or typing.
 *
 * Speech: browser-native recognition is used when available (fast, free, no
 * Gemini request). When it is not (e.g. Firefox desktop), the widget records
 * audio and lets the server transcribe it as a fallback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  useAssistant,
  type AssistantTurn,
} from "@/hooks/assistant/use-assistant";
import { useSpeechRecognition, type SpeechLanguage } from "@/hooks/assistant/use-speech-recognition";
import { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";
import type {
  AssistantPlan,
  AssistantReply,
  Candidate,
  PlanPayload,
} from "@/lib/assistant/types";

const LANGUAGES: Array<{ value: SpeechLanguage; label: string }> = [
  { value: "en-PK", label: "English / Roman Urdu" },
  { value: "ur-PK", label: "اردو" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-US", label: "English (US)" },
];

function money(value: number | undefined, symbol = "Rs.") {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${symbol} ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

export function AssistantWidget() {
  const assistant = useAssistant();
  const recorder = useAudioRecorder();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<SpeechLanguage>("en-PK");
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const speech = useSpeechRecognition({
    language,
    onFinal: (text) => {
      setInput("");
      void assistant.send({ text });
    },
  });

  const busy = assistant.busy;

  useEffect(() => {
    if (open) void assistant.refreshStatus();
  }, [open, assistant]);

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

  const handleMic = useCallback(() => {
    if (busy) return;
    if (speech.supported) {
      if (speech.state === "listening") speech.stop();
      else speech.start();
      return;
    }
    // Fallback: record and let the server transcribe.
    if (recorder.state === "recording") {
      recorder.stop();
    } else {
      void recorder.start((blob, mimeType) => {
        void assistant.send({ audioBlob: blob, audioMimeType: mimeType });
      });
    }
  }, [assistant, busy, recorder, speech]);

  const listening = speech.state === "listening" || recorder.state === "recording";
  const statusLabel = useMemo(() => {
    if (assistant.state === "executing") return "Saving…";
    if (assistant.state === "understanding") return "Understanding…";
    if (assistant.state === "transcribing") return "Transcribing…";
    if (listening) return "Listening…";
    return "Ready";
  }, [assistant.state, listening]);

  const remaining = assistant.rotation?.total.remaining;
  const totalLimit = assistant.rotation?.total.limit;

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open the Khata Assistant"
        className={cn(
          "fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg",
          "transition-transform hover:scale-105 active:scale-95",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Khata Assistant</p>
              <p className="text-xs text-neutral-500">
                {statusLabel}
                {remaining !== undefined && totalLimit !== undefined
                  ? ` · AI ${remaining}/${totalLimit} left today`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {showSettings ? "Done" : "Settings"}
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

          {showSettings ? (
            <div className="space-y-3 border-b border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
              <label className="block">
                <span className="text-xs font-medium text-neutral-500">Speech language</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as SpeechLanguage)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-xs text-neutral-500">
                {speech.supported
                  ? "Fast on-device speech recognition is available in this browser."
                  : "This browser has no on-device speech recognition, so recordings are transcribed by the server."}
              </div>
              {assistant.rotation ? (
                <div className="rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
                  {assistant.rotation.models.map((m) => (
                    <div key={m.id} className="flex justify-between">
                      <span>{m.id}</span>
                      <span>
                        {m.used}/{m.limit}
                        {m.cooldownUntil ? " (cooling)" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => assistant.reset()}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Clear conversation
              </button>
            </div>
          ) : null}

          {/* Conversation */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {assistant.turns.length === 0 ? (
              <div className="space-y-2 text-sm text-neutral-500">
                <p className="font-medium text-neutral-700 dark:text-neutral-200">
                  Speak or type a business command.
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

          {/* Live transcript + input */}
          {listening ? (
            <div className="border-t border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
              <span className="text-neutral-400">You said: </span>
              <span className="text-neutral-800 dark:text-neutral-100">
                {speech.interim || speech.transcript || "…"}
              </span>
            </div>
          ) : null}

          {!speech.supported && recorder.state === "recording" ? (
            <div className="border-t border-neutral-200 px-4 py-2 text-sm text-neutral-500 dark:border-neutral-800">
              Recording… speak now.
            </div>
          ) : null}

          {speech.error && !listening ? (
            <div className="flex items-center gap-2 border-t border-neutral-200 px-4 py-2 text-xs text-amber-600 dark:border-neutral-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              {speech.error.message}
            </div>
          ) : null}

          <div className="flex items-end gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
            <button
              type="button"
              onClick={handleMic}
              disabled={busy}
              aria-label={listening ? "Stop listening" : "Start listening"}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-colors",
                listening ? "bg-red-600" : "bg-emerald-600 hover:bg-emerald-700",
                busy && "opacity-50",
              )}
            >
              {listening ? <Square className="h-4 w-4" /> : speech.supported ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
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
              placeholder="Type or dictate a command…"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
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
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600 px-3 py-2 text-sm text-white">
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
                  <a href={item.href} className="truncate font-medium text-emerald-700 hover:underline dark:text-emerald-400">
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

  // plan
  return <PlanCard plan={reply} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />;
}

const CANDIDATE_KEY: Record<"customers" | "products" | "suppliers", keyof PlanPayload> = {
  customers: "customerId",
  products: "productId",
  suppliers: "supplierId",
};

function PlanCard({
  plan,
  busy,
  onConfirm,
  onCancel,
}: {
  plan: AssistantPlan;
  busy: boolean;
  onConfirm: (actionId: string, patch: Partial<PlanPayload>) => void;
  onCancel: (actionId: string) => void;
}) {
  const [patch, setPatch] = useState<Partial<PlanPayload>>({});
  const [customAmount, setCustomAmount] = useState("");

  const needs = new Set(plan.requires);
  const candidateGroups = Object.entries(plan.candidates).filter(
    ([, list]) => list && list.length > 0,
  ) as Array<["customers" | "products" | "suppliers", Candidate[]]>;

  const blocked =
    (needs.has("customer") && !patch.customerId) ||
    (needs.has("product") && !patch.productId) ||
    (needs.has("supplier") && !patch.supplierId) ||
    (needs.has("paidAmount") && patch.paidAmount === undefined) ||
    (needs.has("amount") && patch.amount === undefined) ||
    (needs.has("quantity") && patch.quantity === undefined) ||
    (needs.has("name") && !patch.name) ||
    (needs.has("targetId") && !patch.targetId);

  return (
    <div className="rounded-2xl rounded-bl-sm border border-neutral-200 bg-white px-3 py-3 text-sm shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <p className="font-semibold text-neutral-900 dark:text-neutral-100">{plan.summary}</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        {plan.source === "ai" ? `Understood with AI${plan.model ? ` (${plan.model})` : ""}` : "Understood directly"}
        {plan.usedContext ? " · using your last customer" : ""}
        {plan.requestsUsed > 0 ? ` · ${plan.requestsUsed} AI request` : " · 0 AI requests"}
      </p>

      <dl className="mt-2 space-y-1">
        {plan.fields.map((field) => (
          <div key={field.label} className="flex justify-between gap-3">
            <dt className="text-neutral-500">{field.label}</dt>
            <dd className="text-right font-medium text-neutral-800 dark:text-neutral-100">{field.value}</dd>
          </div>
        ))}
      </dl>

      {plan.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {plan.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {/* Candidate pickers */}
      {candidateGroups.map(([group, list]) => {
        const key = CANDIDATE_KEY[group];
        const selectedId = patch[key] as string | undefined;
        return (
          <div key={group} className="mt-2">
            <p className="text-xs font-medium text-neutral-500">Pick {group.slice(0, -1)}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {list.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setPatch((p) => ({ ...p, [key]: candidate.id }))}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    selectedId === candidate.id
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900",
                  )}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Paid amount choice */}
      {needs.has("paidAmount") ? (
        <div className="mt-2">
          <p className="text-xs font-medium text-neutral-500">How much did they pay?</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plan.suggested?.paidAmount !== undefined ? (
              <button
                type="button"
                onClick={() =>
                  setPatch((p) => ({ ...p, paidAmount: plan.suggested!.paidAmount }))
                }
                className="rounded-full border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white"
              >
                Full payment ({money(plan.suggested.paidAmount)})
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPatch((p) => ({ ...p, paidAmount: 0 }))}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                patch.paidAmount === 0
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900",
              )}
            >
              On credit
            </button>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={customAmount}
            placeholder="Or type an amount"
            onChange={(e) => {
              setCustomAmount(e.target.value);
              const value = Number(e.target.value);
              setPatch((p) => ({ ...p, paidAmount: Number.isFinite(value) ? value : undefined }));
            }}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          />
        </div>
      ) : null}

      {/* Numeric requirements */}
      {(["amount", "quantity", "unitPrice"] as const)
        .filter((key) => needs.has(key))
        .map((key) => (
          <div key={key} className="mt-2">
            <p className="text-xs font-medium text-neutral-500">{labelFor(key)}</p>
            <input
              type="number"
              inputMode="decimal"
              onChange={(e) => {
                const value = Number(e.target.value);
                setPatch((p) => ({ ...p, [key]: Number.isFinite(value) ? value : undefined }));
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
            />
          </div>
        ))}

      {/* Text requirements */}
      {(["name", "unit", "targetId"] as const)
        .filter((key) => needs.has(key))
        .map((key) => (
          <div key={key} className="mt-2">
            <p className="text-xs font-medium text-neutral-500">{labelFor(key)}</p>
            <input
              type="text"
              onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
            />
          </div>
        ))}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || blocked}
          onClick={() => onConfirm(plan.actionId, patch)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white",
            (busy || blocked) && "opacity-50",
          )}
        >
          <Check className="h-4 w-4" />
          Confirm
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel(plan.actionId)}
          className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function labelFor(key: string): string {
  switch (key) {
    case "amount":
      return "Amount";
    case "quantity":
      return "Quantity";
    case "unitPrice":
      return "Price";
    case "name":
      return "Name";
    case "unit":
      return "Unit";
    case "targetId":
      return "Record ID";
    default:
      return key;
  }
}
