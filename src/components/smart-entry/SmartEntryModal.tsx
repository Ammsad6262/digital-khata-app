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

import { useEffect, useState, useCallback } from "react";
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

  // Wire up the recorder's onStop → smartEntry.submitAudio
  useEffect(() => {
    if (recorder.audioBlob && recorder.audioMimeType && smartEntry.state === "transcribing") {
      // Already submitted — don't double-submit
      return;
    }
  }, [recorder.audioBlob, recorder.audioMimeType, smartEntry.state]);

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
    if (smartEntry.state === "executing") return; // don't close mid-execution
    if (smartEntry.sessionId && !["success", "cancelled", "expired", "error"].includes(smartEntry.state)) {
      smartEntry.cancel();
    }
    // Reset everything
    smartEntry.reset();
    setTextValue("");
    setMode("choice");
    recorder.state; // touch to silence unused warning
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

  if (state === "ready" && smartEntry.preview) {
    return (
      <ConfirmationView
        preview={smartEntry.preview}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  if (state === "ambiguous_customer" && smartEntry.candidates) {
    return (
      <DisambiguationView
        type="customer"
        candidates={smartEntry.candidates}
        message={smartEntry.message}
        onPick={smartEntry.chooseCustomer}
        onCancel={smartEntry.cancel}
      />
    );
  }

  if (state === "ambiguous_product" && smartEntry.candidates) {
    return (
      <DisambiguationView
        type="product"
        candidates={smartEntry.candidates}
        message={smartEntry.message}
        onPick={smartEntry.chooseProduct}
        onCancel={smartEntry.cancel}
      />
    );
  }

  if (state === "clarification" || state === "customer_not_found" ||
      state === "product_not_found" || state === "unsupported_intent") {
    return (
      <MessageState
        title={state === "unsupported_intent" ? "I can only handle credit sales right now"
              : state === "clarification" ? "Need a bit more info"
              : state === "customer_not_found" ? "Customer not found"
              : "Product not found"}
        message={smartEntry.message ?? "Please try again."}
        icon={state === "unsupported_intent" ? <AlertCircle className="h-6 w-6" />
              : <AlertTriangle className="h-6 w-6" />}
        tone={state === "unsupported_intent" || state === "customer_not_found" || state === "product_not_found" ? "amber" : "blue"}
        onRetry={() => smartEntry.reset()}
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

  if (state === "recording") {
    return (
      <RecordingState
        levels={recorder.levels}
        onStop={onStopRecording}
        onCancel={() => {
          onStopRecording();
          smartEntry.reset();
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
  setMode,
  textValue,
  setTextValue,
  onStartRecording,
  onTextSubmit,
  recorderError,
  recorderState,
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
  // If mic permission was denied, show the error inline
  if (recorderState === "denied" || recorderState === "unsupported") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">🎤 Microphone unavailable</p>
          <p className="mt-1 text-xs">{recorderError}</p>
          <p className="mt-2 text-xs">You can still use text input below.</p>
        </div>
        <TextInput
          value={textValue}
          setTextValue={setTextValue}
          onSubmit={onTextSubmit}
          autoFocus
        />
      </div>
    );
  }

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

      {/* Text input */}
      <TextInput
        value={textValue}
        setTextValue={setTextValue}
        onSubmit={onTextSubmit}
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
