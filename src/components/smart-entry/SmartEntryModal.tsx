"use client";

/**
 * SmartEntryModal — the full Smart Khata Entry UI.
 *
 * A modal/bottom sheet that handles all 16 UX states:
 *   idle | recording | transcribing | interpreting | ready | clarification
 *   | ambiguous_customer | ambiguous_product | customer_not_found
 *   | product_not_found | unsupported_intent | confirming | executing
 *   | success | cancelled | expired | error
 *
 * Architecture:
 *   - Voice input: tap mic → MediaRecorder records → auto-stop on 2s silence
 *                  → POST /api/smart-entry/interpret with audio
 *   - Text input:  user types → submit → POST /api/smart-entry/interpret with text
 *   - Both paths converge on the same useSmartEntry state machine.
 *   - Confirmation: shows preview (customer, product, qty, amount) + buttons
 *   - Disambiguation: shows candidate list → user picks → execute with chosen ID
 *   - Success: shows "Added to Khata" + link to view the sale
 *
 * Rendered via Portal to document.body so it escapes any parent stacking
 * context (the Dashboard uses z-20 sticky headers; this modal needs z-[80]).
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Mic,
  MicOff,
  Send,
  Loader2,
  Check,
  AlertCircle,
  Sparkles,
  User,
  Package,
  ArrowRight,
  AlertTriangle,
  Type,
  ChevronDown,
} from "lucide-react";
import { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";
import { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";

export function SmartEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const smartEntry = useSmartEntry();
  const recorder = useAudioRecorder();
  const [mounted, setMounted] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [mode, setMode] = useState<"choice" | "voice" | "text">("choice");

  useEffect(() => setMounted(true), []);

  // Close on Escape + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleStartRecording = useCallback(async () => {
    setMode("voice");
    await recorder.start(async (blob, mimeType) => {
      // This callback fires when recording stops
      await smartEntry.submitAudio(blob, mimeType);
    });
  }, [recorder, smartEntry]);

  const handleStopRecording = useCallback(() => {
    recorder.stop();
  }, [recorder]);

  const handleTextSubmit = useCallback(async () => {
    const text = textValue.trim();
    if (!text) return;
    await smartEntry.submitText(text);
  }, [textValue, smartEntry]);

  const handleClose = useCallback(() => {
    // Don't allow closing mid-execution (would orphan a sale creation)
    if (smartEntry.state === "executing") return;
    // If there's an active session that hasn't reached a terminal state,
    // cancel it server-side (frees the session row + prevents stale
    // AWAITING_CONFIRMATION rows from accumulating)
    const terminalStates = ["success", "cancelled", "expired", "error"];
    if (smartEntry.sessionId && !terminalStates.includes(smartEntry.state)) {
      smartEntry.cancel();
    }
    // Reset local UI state
    smartEntry.reset();
    setTextValue("");
    setMode("choice");
    // If recording is in-flight, cancel it WITHOUT submitting the audio
    // (just stopping the recorder would fire onstop → submitAudio — wrong)
    if (recorder.state === "recording" || recorder.state === "requesting") {
      recorder.cancel();
    }
    onClose();
  }, [smartEntry, recorder, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-[2px]"
        onClick={handleClose}
        aria-hidden
      />

      {/* Modal — bottom sheet on mobile, centered on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Smart Khata Entry"
        className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:inset-y-8 sm:bottom-auto sm:rounded-2xl"
        style={{
          animation: "se-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Smart Entry</h2>
              <p className="text-[11px] text-slate-500">Speak or type what happened</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={smartEntry.state === "executing"}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — renders based on current state */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <SmartEntryBody
            smartEntry={smartEntry}
            recorder={recorder}
            mode={mode}
            setMode={setMode}
            textValue={textValue}
            setTextValue={setTextValue}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onTextSubmit={handleTextSubmit}
          />
        </div>

        <style>{`
          @keyframes se-slide-up {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
          @keyframes se-pulse-ring {
            0%   { transform: scale(0.9); opacity: 0.7; }
            50%  { transform: scale(1.2); opacity: 0.2; }
            100% { transform: scale(0.9); opacity: 0.7; }
          }
        `}</style>
      </div>
    </>,
    document.body,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Body — switches based on the smart entry state
// ────────────────────────────────────────────────────────────────────────────

function SmartEntryBody({
  smartEntry,
  recorder,
  mode,
  setMode,
  textValue,
  setTextValue,
  onStartRecording,
  onStopRecording,
  onTextSubmit,
}: {
  smartEntry: ReturnType<typeof useSmartEntry>;
  recorder: ReturnType<typeof useAudioRecorder>;
  mode: "choice" | "voice" | "text";
  setMode: (m: "choice" | "voice" | "text") => void;
  textValue: string;
  setTextValue: (v: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTextSubmit: () => void;
}) {
  const { state } = smartEntry;

  // Loading states (transcribing + interpreting are similar but distinct for UX)
  if (state === "transcribing" || state === "interpreting") {
    return (
      <LoadingState
        title={state === "transcribing" ? "Listening..." : "Understanding..."}
        subtitle={state === "transcribing"
          ? "Converting your voice to text"
          : "Figuring out what you meant"}
      />
    );
  }

  if (state === "executing") {
    return <LoadingState title="Adding to Khata..." subtitle="Creating the transaction" />;
  }

  // V2: the editable form. This is the new normal state — replaces ready,
  // clarification, ambiguous_customer, ambiguous_product, customer_not_found,
  // product_not_found, unsupported_intent. The form pre-fills whatever the
  // AI understood and the user completes/edits the rest manually.
  if (state === "form" && smartEntry.form) {
    return (
      <EditableFormView
        form={smartEntry.form}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  if (state === "success") {
    return (
      <SuccessState
        message={smartEntry.message ?? "Added to Khata"}
        saleId={smartEntry.createdSaleId}
        onDone={smartEntry.reset}
      />
    );
  }

  if (state === "cancelled") {
    return (
      <MessageState
        title="Cancelled"
        message="The entry was not added to your Khata."
        icon={<X className="h-6 w-6" />}
        tone="slate"
        onRetry={() => smartEntry.reset()}
      />
    );
  }

  if (state === "error") {
    return (
      <MessageState
        title="Something went wrong"
        message={smartEntry.message ?? smartEntry.error ?? "Please try again."}
        icon={<AlertCircle className="h-6 w-6" />}
        tone="red"
        onRetry={() => smartEntry.reset()}
      />
    );
  }

  // ── Recording-related states ──────────────────────────────────────────────
  // These come from the recorder, NOT the smartEntry hook — the recorder
  // owns the mic lifecycle, the hook owns the API lifecycle. We have to
  // check BOTH to render the correct UI.
  //
  // recorder.state values:
  //   "idle"        — not recording (initial or after stop)
  //   "requesting"  — asking for mic permission
  //   "recording"   — actively recording audio
  //   "stopping"    — recorder.stop() called, onstop pending
  //   "denied"      — user denied mic permission (or browser blocked it)
  //   "unsupported" — browser doesn't support MediaRecorder
  //   "error"       — other recorder error
  //
  // smartEntry.state values relevant here:
  //   "transcribing" — audio has been submitted to the API (recorder already stopped)
  //   "interpreting" — text submitted to the API
  //   "ready" / "ambiguous_*" / "clarification" / "success" / etc.
  //
  // Priority: if recorder is actively recording or requesting, show the
  // recording UI. Only when the recorder returns to idle do we let the
  // smartEntry state take over (transcribing, interpreting, etc.).
  if (recorder.state === "requesting") {
    return (
      <LoadingState
        title="Requesting microphone..."
        subtitle="Allow microphone access to speak"
      />
    );
  }

  if (recorder.state === "recording" || recorder.state === "stopping") {
    return (
      <RecordingState
        levels={recorder.levels}
        onStop={onStopRecording}
        onCancel={() => {
          // Cancel the recording (discard audio, don't submit it)
          recorder.cancel();
          // Reset back to the choice view (no session to cancel server-side yet)
          smartEntry.reset();
        }}
      />
    );
  }

  if (recorder.state === "denied" || recorder.state === "unsupported" || recorder.state === "error") {
    return (
      <MicErrorState
        state={recorder.state}
        message={recorder.error ?? "Please try typing instead, or check your browser settings."}
        onRetry={() => {
          // Reset BOTH the recorder (so it leaves the error state) and the
          // smartEntry hook (so the choice view renders again)
          recorder.reset();
          smartEntry.reset();
          setMode("choice");
        }}
        onUseText={() => {
          // Switch to text mode — clear the recorder error, show the choice view
          // with the text input pre-focused.
          recorder.reset();
          smartEntry.reset();
          setMode("text");
        }}
      />
    );
  }

  // idle — show the choice view
  return (
    <ChoiceView
      mode={mode}
      setMode={setMode}
      textValue={textValue}
      setTextValue={setTextValue}
      onStartRecording={onStartRecording}
      onStopRecording={onStopRecording}
      onTextSubmit={onTextSubmit}
      recorderError={recorder.error}
      recorderState={recorder.state}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function ChoiceView({
  mode,
  setMode: _setMode,
  textValue,
  setTextValue,
  onStartRecording,
  onTextSubmit,
  recorderError: _recorderError,
  recorderState: _recorderState,
}: {
  mode: "choice" | "voice" | "text";
  setMode: (m: "choice" | "voice" | "text") => void;
  textValue: string;
  setTextValue: (v: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTextSubmit: () => void;
  recorderError: string | null;
  recorderState: string;
}) {
  // Note: mic-error states (denied/unsupported/error) are handled by
  // MicErrorState in the parent SmartEntryBody — by the time we reach
  // ChoiceView, the recorder is in a usable state (idle). If the user
  // previously hit a mic error and chose "Type instead", `mode` is "text"
  // and we auto-focus the text input.
  return (
    <div className="space-y-4">
      {/* Example prompts */}
      <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
        <p className="mb-1.5 font-medium text-slate-700">Try saying or typing:</p>
        <ul className="space-y-1">
          <li className="text-slate-600">"Ahmad ne 25 kilo chawal liya"</li>
          <li className="text-slate-600">"Ahmad has bought 25 kg rice"</li>
          <li className="text-slate-600">"احمد نے 25 کلو چاول لیے"</li>
        </ul>
      </div>

      {/* Voice button */}
      <button
        type="button"
        onClick={onStartRecording}
        className="group relative flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-6 py-8 text-brand-700 transition-colors hover:bg-brand-50 active:scale-[0.99]"
      >
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-transform group-hover:scale-105">
          <Mic className="h-7 w-7" />
        </div>
        <div className="text-center">
          <p className="font-semibold">Tap to speak</p>
          <p className="text-xs text-slate-500">Tell me what happened</p>
        </div>
      </button>

      {/* OR divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">OR TYPE</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Text input — auto-focus when user came from "Type instead" */}
      <TextInput
        value={textValue}
        setTextValue={setTextValue}
        onSubmit={onTextSubmit}
        autoFocus={mode === "text"}
      />
    </div>
  );
}

function TextInput({
  value,
  setTextValue,
  onSubmit,
  autoFocus,
}: {
  value: string;
  setTextValue: (v: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex items-end gap-2"
    >
      <textarea
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setTextValue(e.target.value)}
        placeholder="Type what happened..."
        rows={2}
        className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm transition-colors hover:bg-brand-700 active:scale-95 disabled:bg-brand-300"
        aria-label="Submit"
      >
        <Send className="h-5 w-5" />
      </button>
    </form>
  );
}

function RecordingState({
  levels,
  onStop,
  onCancel,
}: {
  levels: number;
  onStop: () => void;
  onCancel: () => void;
}) {
  // Visual: pulsing circle, size scales with audio level
  const size = 80 + Math.min(40, levels * 80);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      <p className="text-base font-semibold text-slate-900">Listening...</p>

      <div className="relative flex items-center justify-center" style={{ height: 160 }}>
        {/* Outer pulse ring */}
        <div
          className="absolute rounded-full bg-red-500/30"
          style={{
            width: size,
            height: size,
            animation: "se-pulse-ring 1.5s ease-in-out infinite",
          }}
        />
        {/* Inner solid circle */}
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40">
          <Mic className="h-8 w-8" />
        </div>
      </div>

      <p className="text-xs text-slate-500">Tap stop when you're done, or it'll auto-stop on silence.</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:scale-95"
        >
          <span className="h-2.5 w-2.5 rounded-sm bg-white" />
          Stop & Send
        </button>
      </div>
    </div>
  );
}

function LoadingState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div
          className="absolute rounded-full border-4 border-brand-200"
          style={{
            width: 64,
            height: 64,
            animation: "se-pulse-ring 1.2s ease-in-out infinite",
          }}
        />
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function ConfirmationView({
  preview,
  transcript,
  onConfirm,
  onCancel,
}: {
  preview: {
    intent: string;
    customerName: string;
    productName: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    amount: string;
    customerId: string;
    productId: string;
  };
  transcript: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Transcript */}
      {transcript ? (
        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">You said</p>
          <p className="mt-1 text-sm italic text-slate-700">"{transcript}"</p>
        </div>
      ) : null}

      {/* Preview */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">I understood:</h3>

        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4">
          <PreviewRow icon={<User className="h-4 w-4" />} label="Customer" value={preview.customerName} />
          <div className="h-px bg-slate-100" />
          <PreviewRow icon={<Package className="h-4 w-4" />} label="Product" value={preview.productName} />
          <div className="h-px bg-slate-100" />
          <PreviewRow
            icon={<Sparkles className="h-4 w-4" />}
            label="Quantity"
            value={`${preview.quantity} ${preview.unit}`}
          />
          <div className="h-px bg-slate-100" />
          <PreviewRow
            icon={<ArrowRight className="h-4 w-4" />}
            label="Type"
            value="Credit sale (udhaar)"
          />
        </div>

        {/* Amount */}
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">Amount</p>
          <p className="mt-1 text-2xl font-bold text-brand-900">
            {formatMoney(preview.amount)}
          </p>
          <p className="mt-1 text-xs text-brand-600">
            {preview.quantity} × {formatMoney(preview.unitPrice)} per {preview.unit}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-colors hover:bg-brand-700 active:scale-[0.98]"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" />
            Add to Khata
          </span>
        </button>
      </div>
    </div>
  );
}

function PreviewRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="text-slate-400">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function DisambiguationView({
  type,
  candidates,
  message,
  onPick,
  onCancel,
}: {
  type: "customer" | "product";
  candidates: Array<{ id: string; name: string; phone?: string | null; unit?: string | null; sellingPrice?: string | null }>;
  message: string | null;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Multiple {type}s found</h3>
        {message ? <p className="mt-1 text-xs text-slate-500">{message}</p> : null}
      </div>

      <div className="space-y-2">
        {candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
          >
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              type === "customer" ? "bg-brand-50 text-brand-600" : "bg-indigo-50 text-indigo-600",
            )}>
              {type === "customer" ? <User className="h-5 w-5" /> : <Package className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
              {c.phone ? <p className="text-xs text-slate-500">{c.phone}</p> : null}
              {c.unit ? (
                <p className="text-xs text-slate-500">
                  {c.unit}{c.sellingPrice ? ` · ${formatMoney(c.sellingPrice)}` : ""}
                </p>
              ) : null}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  );
}

function MessageState({
  title,
  message,
  icon,
  tone,
  onRetry,
}: {
  title: string;
  message: string;
  icon: React.ReactNode;
  tone: "amber" | "blue" | "red" | "slate";
  onRetry: () => void;
}) {
  const toneClasses = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    red: "bg-red-50 text-red-700 border-red-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  }[tone];

  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border p-4", toneClasses)}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm">{message}</p>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Try again
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EditableFormView — V2: the new normal Smart Khata state.
//
// The AI returns whatever it understood (possibly partial). The form pre-fills
// the resolved fields and leaves missing ones empty. The user reviews/edits
// and clicks "Add to Khata" to execute.
//
// Form fields:
//   - Customer: searchable picker (limited to the user's customers)
//   - Product:  searchable picker (limited to the user's products)
//   - Quantity: numeric input
//   - Unit:     read-only display of the product's unit
//   - Amount:   auto-calculated = quantity × product.sellingPrice (read-only)
//
// Submit is disabled until customer + product + quantity are all set.
// ════════════════════════════════════════════════════════════════════════════

function EditableFormView({
  form,
  transcript,
  onConfirm,
  onCancel,
}: {
  form: {
    customerNameRaw: string | null;
    productNameRaw: string | null;
    quantityRaw: number | null;
    unitRaw: string | null;
    resolvedCustomerId: string | null;
    resolvedProductId: string | null;
    customerCandidates: Array<{ id: string; name: string; phone?: string | null }>;
    productCandidates: Array<{ id: string; name: string; unit?: string | null; sellingPrice?: string | null }>;
    hint: string | null;
  };
  transcript: string | null;
  onConfirm: (input: { customerId: string; productId: string; quantity: number }) => void;
  onCancel: () => void;
}) {
  // Local form state — initialized from the AI-resolved values, fully editable
  const [customerId, setCustomerId] = useState<string>(form.resolvedCustomerId ?? "");
  const [productId, setProductId] = useState<string>(form.resolvedProductId ?? "");
  const [quantityStr, setQuantityStr] = useState<string>(
    form.quantityRaw != null ? String(form.quantityRaw) : ""
  );

  // Find the selected product (for unit + price display)
  const selectedProduct = form.productCandidates.find((p) => p.id === productId);
  const unit = selectedProduct?.unit ?? form.unitRaw ?? null;
  const unitPrice = selectedProduct?.sellingPrice ? Number(selectedProduct.sellingPrice) : null;
  const quantityNum = Number(quantityStr);
  const isValidQuantity = Number.isFinite(quantityNum) && quantityNum > 0;
  const amount = isValidQuantity && unitPrice != null ? quantityNum * unitPrice : null;

  // Validation: customer + product + valid quantity all required
  const canSubmit = !!customerId && !!productId && isValidQuantity;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({ customerId, productId, quantity: quantityNum });
  };

  return (
    <div className="space-y-4">
      {/* Transcript — what the user said (builds trust) */}
      {transcript ? (
        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">You said</p>
          <p className="mt-1 text-sm italic text-slate-700">"{transcript}"</p>
        </div>
      ) : null}

      {/* Hint — helpful message for missing fields */}
      {form.hint ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          <p className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>{form.hint}</span>
          </p>
        </div>
      ) : null}

      {/* The form */}
      <div className="space-y-3">
        {/* Customer picker */}
        <Field
          label="Customer"
          isFilled={!!customerId}
        >
          <SearchablePicker
            value={customerId}
            onChange={setCustomerId}
            candidates={form.customerCandidates}
            placeholder={form.customerNameRaw ?? "Search customer..."}
            emptyText="No customers found. Add a customer first."
          />
        </Field>

        {/* Product picker */}
        <Field
          label="Product"
          isFilled={!!productId}
        >
          <SearchablePicker
            value={productId}
            onChange={setProductId}
            candidates={form.productCandidates}
            placeholder={form.productNameRaw ?? "Search product..."}
            emptyText="No products found. Add a product first."
            getSubtitle={(p) => p.unit ? `${p.unit}${p.sellingPrice ? ` · Rs. ${p.sellingPrice}` : ""}` : null}
          />
        </Field>

        {/* Quantity + Unit (side by side on wider screens) */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Quantity" isFilled={isValidQuantity}>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </Field>
          <Field label="Unit" isFilled={!!unit}>
            <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
              {unit ?? "—"}
            </div>
          </Field>
        </div>

        {/* Amount — auto-calculated, read-only */}
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">Amount</p>
              <p className="mt-0.5 text-2xl font-bold text-brand-900">
                {amount != null ? formatMoney(amount) : "—"}
              </p>
            </div>
            {unitPrice != null && isValidQuantity ? (
              <p className="text-xs text-brand-600">
                {quantityNum} × {formatMoney(unitPrice)}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-colors hover:bg-brand-700 active:scale-[0.98] disabled:bg-brand-300 disabled:shadow-none"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" />
            Add to Khata
          </span>
        </button>
      </div>
    </div>
  );
}

/** Field wrapper with label + filled-state indicator. */
function Field({
  label,
  isFilled,
  children,
}: {
  label: string;
  isFilled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        {label}
        {isFilled ? (
          <Check className="h-3 w-3 text-green-600" strokeWidth={3} />
        ) : null}
      </label>
      {children}
    </div>
  );
}

/**
 * SearchablePicker — a dropdown that lets the user search and pick from
 * a list of candidates. Renders as a button showing the current selection
 * (or placeholder), opens a small search overlay when tapped.
 */
function SearchablePicker<T extends { id: string; name: string }>({
  value,
  onChange,
  candidates,
  placeholder,
  emptyText,
  getSubtitle,
}: {
  value: string;
  onChange: (id: string) => void;
  candidates: T[];
  placeholder: string;
  emptyText: string;
  getSubtitle?: (item: T) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = candidates.find((c) => c.id === value);

  // Filter candidates by query (case-insensitive contains)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, query]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-900 hover:border-brand-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      >
        <span className={selected ? "text-slate-900" : "text-slate-400"}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {/* Search overlay */}
      {open ? (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-[110] mx-auto flex max-h-[70dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
               style={{ animation: "se-slide-up 0.2s ease-out" }}>
            {/* Search input */}
            <div className="border-b border-slate-100 p-3">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">{emptyText}</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50",
                      c.id === value && "bg-brand-50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                      {getSubtitle ? (
                        <p className="text-xs text-slate-500">{getSubtitle(c)}</p>
                      ) : null}
                    </div>
                    {c.id === value ? <Check className="h-4 w-4 shrink-0 text-brand-600" /> : null}
                  </button>
                ))
              )}
            </div>
            {/* Close button */}
            <div className="border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
                </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function SuccessState({
  message,
  saleId,
  onDone,
}: {
  message: string;
  saleId: string | null;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-8 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div
          className="absolute rounded-full bg-green-500/20"
          style={{
            width: 80,
            height: 80,
            animation: "se-pulse-ring 1.2s ease-in-out infinite",
          }}
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/40">
          <Check className="h-8 w-8" strokeWidth={3} />
        </div>
      </div>
      <div>
        <p className="text-lg font-bold text-slate-900">Added to Khata</p>
        <p className="mt-1 text-sm text-slate-600">{message}</p>
      </div>
      <div className="flex w-full gap-2">
        {saleId ? (
          <Link
            href={`/sales/${saleId}`}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View Sale
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * MicErrorState — shown when the recorder can't access the microphone.
 *
 * Offers TWO actions:
 *   - "Try again" — resets the recorder + smartEntry, goes back to the
 *     choice view so the user can retry the mic.
 *   - "Type instead" — switches to text input mode (fallback for users
 *     whose mic is broken/denied/unsupported).
 *
 * This screen is the answer to "the mic button doesn't work" — it gives
 * the user a clear explanation + a path forward instead of leaving them
 * stuck staring at an error.
 */
function MicErrorState({
  state,
  message,
  onRetry,
  onUseText,
}: {
  state: "denied" | "unsupported" | "error";
  message: string;
  onRetry: () => void;
  onUseText: () => void;
}) {
  const title =
    state === "denied" ? "Microphone permission denied"
    : state === "unsupported" ? "Microphone not supported"
    : "Microphone unavailable";
  const helpText =
    state === "denied"
      ? "Your browser blocked microphone access. You can allow it in your browser's site settings (look for the mic icon in the address bar), then tap 'Try again'."
      : state === "unsupported"
      ? "This browser doesn't support audio recording. Try Chrome, Edge, or Safari, or use the text input instead."
      : "We couldn't access your microphone. Make sure no other app is using it, then try again — or use the text input below.";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">
            <MicOff className="h-6 w-6" />
          </span>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm">{message}</p>
            <p className="mt-2 text-xs text-amber-700">{helpText}</p>
          </div>
        </div>
      </div>

      {/* Two buttons: retry mic, or switch to text */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.98]"
        >
          <Mic className="h-4 w-4" />
          Try microphone again
        </button>
        <button
          type="button"
          onClick={onUseText}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
        >
          <Type className="h-4 w-4" />
          Type instead
        </button>
      </div>
    </div>
  );
}
