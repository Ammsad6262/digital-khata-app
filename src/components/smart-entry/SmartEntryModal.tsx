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
  UserPlus,
  Plus,
  Package,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Type,
  ChevronDown,
  Wallet,
} from "lucide-react";
import { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";
import { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useSettings } from "@/hooks/use-settings";

export function SmartEntryModal({
  open,
  onClose,
  smartEntry,
  recorder,
}: {
  open: boolean;
  onClose: () => void;
  smartEntry: ReturnType<typeof useSmartEntry>;
  recorder: ReturnType<typeof useAudioRecorder>;
}) {
  const [mounted, setMounted] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [mode, setMode] = useState<"choice" | "voice" | "text">("choice");
  const { t } = useLanguage();

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
    // This is called when the user uses the in-modal recording (if any).
    // In V9, the primary recording is via the Dashboard FAB, but we keep
    // this for backwards compatibility (e.g. MicErrorState retry).
    setMode("voice");
    await recorder.start(async (blob, mimeType) => {
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

      {/* Modal — bottom sheet on mobile, centered on desktop.
          V7: Content-aware height — short content (ChoiceView, LoadingState)
          gets a compact sheet (~50-60% viewport). Long content (EditableFormView
          with pickers, AddProductWizard) expands up to ~90% viewport.
          On desktop (sm+), it's a centered modal with max-w-[640px]. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("smartentry.aria.dialog")}
        className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:inset-y-8 sm:bottom-auto sm:rounded-2xl"
        style={{
          // Mobile: content-aware max-height. The sheet will be as tall as its
          // content needs, up to 90dvh. Short content (ChoiceView) will be ~50%.
          // Long content (form with pickers) will expand to ~90%.
          // Desktop (sm+): centered modal with fixed max dimensions.
          maxHeight: "90dvh",
          animation: "se-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
        }}
      >
        {/* Drag handle — visual indicator that this is a bottom sheet */}
        <div className="flex shrink-0 justify-center pt-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-300" aria-hidden />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{t("smartentry.title")}</h2>
              <p className="text-[11px] text-slate-500">{t("smartentry.subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={smartEntry.state === "executing"}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
            aria-label={t("smartentry.aria.close")}
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
  const { t } = useLanguage();

  // ── Priority: smartEntry states FIRST, recorder states SECOND ─────────────
  // When the user clicks "Stop & Send", the recorder goes "recording" →
  // "stopping" → "idle", and then onstop fires which calls submitAudio()
  // which sets smartEntry.state to "transcribing". There's a brief race
  // condition where recorder is "idle" but smartEntry hasn't yet updated
  // to "transcribing". To prevent the UI from flashing back to the choice
  // view during that gap, we check smartEntry states FIRST.
  //
  // Only when smartEntry is "idle" do we check recorder state (for the
  // recording/requesting/denied UI).

  // Loading states (transcribing + interpreting are similar but distinct for UX)
  if (state === "transcribing" || state === "interpreting") {
    return (
      <LoadingState
        title={state === "transcribing" ? t("smartentry.loading.listening") : t("smartentry.loading.understanding")}
        subtitle={state === "transcribing"
          ? t("smartentry.loading.listeningSubtitle")
          : t("smartentry.loading.understandingSubtitle")}
      />
    );
  }

  if (state === "executing") {
    return <LoadingState title={t("smartentry.loading.executing")} subtitle={t("smartentry.loading.executingSubtitle")} />;
  }

  // V10: Expense form (for CREATE_EXPENSE intent)
  if (state === "form" && smartEntry.expenseForm) {
    return (
      <ExpenseFormView
        form={smartEntry.expenseForm}
        transcript={smartEntry.transcript}
        sessionId={smartEntry.sessionId}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // V10: Payment form (for RECORD_PAYMENT intent)
  if (state === "form" && smartEntry.paymentForm) {
    return (
      <PaymentFormView
        form={smartEntry.paymentForm}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // Supplier payment (money OUT)
  if (state === "form" && smartEntry.supplierPaymentForm) {
    return (
      <SupplierPaymentFormView
        form={smartEntry.supplierPaymentForm}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // Reminder / follow-up
  if (state === "form" && smartEntry.reminderForm) {
    return (
      <ReminderFormView
        form={smartEntry.reminderForm}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // Purchase from a named supplier (stock in + payable)
  if (state === "form" && smartEntry.purchaseForm) {
    return (
      <PurchaseFormView
        form={smartEntry.purchaseForm}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // V10: Query result (for QUERY intent)
  if (state === "form" && smartEntry.queryResult) {
    return (
      <QueryResultView
        result={smartEntry.queryResult}
        transcript={smartEntry.transcript}
        onDone={smartEntry.reset}
      />
    );
  }

  // V11: Stock intake form (for STOCK_INTAKE intent)
  if (state === "form" && smartEntry.stockIntakeForm) {
    return (
      <StockIntakeFormView
        form={smartEntry.stockIntakeForm}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // V13: Product creation form (for CREATE_PRODUCT intent — NOT the sale form)
  if (state === "form" && smartEntry.productCreationForm) {
    return (
      <ProductCreationView
        form={smartEntry.productCreationForm}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // V13: Customer creation form (for CREATE_CUSTOMER intent — NOT the sale form)
  if (state === "form" && smartEntry.customerCreationForm) {
    return (
      <CustomerCreationView
        form={smartEntry.customerCreationForm}
        transcript={smartEntry.transcript}
        onConfirm={smartEntry.confirm}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // V13: Clarification (for UNKNOWN intent — NOT the sale form)
  if (state === "form" && smartEntry.clarification) {
    return (
      <ClarificationView
        clarification={smartEntry.clarification}
        transcript={smartEntry.transcript}
        onRetry={smartEntry.reset}
        onCancel={smartEntry.cancel}
      />
    );
  }

  // V2: the editable sale form (for CREATE_CREDIT_SALE intent).
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
        message={smartEntry.message ? t(smartEntry.message as never) : t("smartentry.success.title")}
        saleId={smartEntry.createdSaleId}
        productId={smartEntry.createdProductId}
        customerId={smartEntry.createdCustomerId}
        onDone={smartEntry.reset}
      />
    );
  }

  if (state === "cancelled") {
    return (
      <MessageState
        title={t("smartentry.cancelled.title")}
        message={t("smartentry.cancelled.message")}
        icon={<X className="h-6 w-6" />}
        tone="slate"
        onRetry={() => smartEntry.reset()}
      />
    );
  }

  if (state === "error") {
    return (
      <MessageState
        title={t("smartentry.error.title")}
        message={smartEntry.message ? t(smartEntry.message as never) : smartEntry.error ? t(smartEntry.error as never) : t("smartentry.error.fallback")}
        icon={<AlertCircle className="h-6 w-6" />}
        tone="red"
        onRetry={() => smartEntry.reset()}
      />
    );
  }

  // ── Recorder states (only checked when smartEntry is idle) ────────────────
  if (recorder.state === "requesting") {
    return (
      <LoadingState
        title={t("smartentry.loading.requestingMic")}
        subtitle={t("smartentry.loading.requestingMicSubtitle")}
      />
    );
  }

  if (recorder.state === "recording" || recorder.state === "stopping") {
    return (
      <RecordingState
        levels={recorder.levels}
        onStop={onStopRecording}
        onCancel={() => {
          recorder.cancel();
          smartEntry.reset();
        }}
      />
    );
  }

  if (recorder.state === "denied" || recorder.state === "unsupported" || recorder.state === "error") {
    return (
      <MicErrorState
        state={recorder.state}
        message={recorder.error ? t(recorder.error as never) : t("smartentry.micError.fallback")}
        onRetry={() => {
          recorder.reset();
          smartEntry.reset();
          setMode("choice");
        }}
        onUseText={() => {
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
      onCancelRecording={() => {
        recorder.cancel();
        smartEntry.reset();
      }}
      onTextSubmit={onTextSubmit}
      recorderError={recorder.error}
      recorderState={recorder.state}
      recorderLevels={recorder.levels}
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
  onStopRecording,
  onCancelRecording,
  onTextSubmit,
  recorderError: _recorderError,
  recorderState,
  recorderLevels,
}: {
  mode: "choice" | "voice" | "text";
  setMode: (m: "choice" | "voice" | "text") => void;
  textValue: string;
  setTextValue: (v: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onTextSubmit: () => void;
  recorderError: string | null;
  recorderState: string;
  recorderLevels: number;
}) {
  const { t } = useLanguage();
  // Note: mic-error states (denied/unsupported/error) are handled by
  // MicErrorState in the parent SmartEntryBody — by the time we reach
  // ChoiceView, the recorder is in a usable state (idle). If the user
  // previously hit a mic error and chose "Type instead", `mode` is "text"
  // and we auto-focus the text input.
  return (
    <div className="space-y-4">
      {/* Example prompts */}
      <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
        <p className="mb-1.5 font-medium text-slate-700">{t("smartentry.choice.examplesLabel")}</p>
        <ul className="space-y-1">
          <li className="text-slate-600">&ldquo;{t("smartentry.choice.example1")}&rdquo;</li>
          <li className="text-slate-600">&ldquo;{t("smartentry.choice.example2")}&rdquo;</li>
          <li className="text-slate-600">&ldquo;{t("smartentry.choice.example3")}&rdquo;</li>
        </ul>
      </div>

      {/* Voice hint — the primary voice input is the Dashboard FAB.
          The user should hold the mic button on the Dashboard to record.
          This sheet is for text entry, review, and clarification. */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5 text-xs text-brand-800">
        <p className="flex items-center gap-1.5">
          <Mic className="h-4 w-4 shrink-0" />
          <span>{t("smartentry.choice.holdMicHint")}</span>
        </p>
      </div>

      {/* OR divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">{t("smartentry.choice.orType")}</span>
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
  const { t } = useLanguage();
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
        placeholder={t("smartentry.input.placeholder")}
        rows={2}
        className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm transition-colors hover:bg-brand-700 active:scale-95 disabled:bg-brand-300"
        aria-label={t("smartentry.aria.submit")}
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
  const { t } = useLanguage();
  // Visual: pulsing circle, size scales with audio level
  const size = 80 + Math.min(40, levels * 80);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      <p className="text-base font-semibold text-slate-900">{t("smartentry.recording.listening")}</p>

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

      <p className="text-xs text-slate-500">{t("smartentry.recording.hint")}</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t("smartentry.action.cancel")}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:scale-95"
        >
          <span className="h-2.5 w-2.5 rounded-sm bg-white" />
          {t("smartentry.action.stopAndSend")}
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
  const { t, tParams } = useLanguage();
  return (
    <div className="space-y-5">
      {/* Transcript */}
      {transcript ? (
        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.transcript.youSaid")}</p>
          <p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p>
        </div>
      ) : null}

      {/* Preview */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">{t("smartentry.confirm.iUnderstood")}</h3>

        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4">
          <PreviewRow icon={<User className="h-4 w-4" />} label={t("smartentry.field.customer")} value={preview.customerName} />
          <div className="h-px bg-slate-100" />
          <PreviewRow icon={<Package className="h-4 w-4" />} label={t("smartentry.field.product")} value={preview.productName} />
          <div className="h-px bg-slate-100" />
          <PreviewRow
            icon={<Sparkles className="h-4 w-4" />}
            label={t("smartentry.field.quantity")}
            value={`${preview.quantity} ${preview.unit}`}
          />
          <div className="h-px bg-slate-100" />
          <PreviewRow
            icon={<ArrowRight className="h-4 w-4 rtl-flip" />}
            label={t("smartentry.field.type")}
            value={t("smartentry.confirm.creditSaleType")}
          />
        </div>

        {/* Amount */}
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">{t("smartentry.field.amount")}</p>
          <p className="mt-1 text-2xl font-bold text-brand-900">
            {formatMoney(preview.amount)}
          </p>
          <p className="mt-1 text-xs text-brand-600">
            {tParams("smartentry.confirm.quantityTimesPrice", { qty: preview.quantity, price: formatMoney(preview.unitPrice), unit: preview.unit })}
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
          {t("smartentry.action.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-colors hover:bg-brand-700 active:scale-[0.98]"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" />
            {t("smartentry.action.addToKhata")}
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
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{type === "customer" ? t("smartentry.disambig.multipleCustomers") : t("smartentry.disambig.multipleProducts")}</h3>
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
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 rtl-flip" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {t("smartentry.action.cancel")}
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
  const { t } = useLanguage();
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
        {t("smartentry.action.tryAgain")}
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
    batchNameRaw: string | null;
    explicitUnitPrice: number | null;
    explicitTotal: number | null;
    explicitPaidAmount: number | null;
    resolvedCustomerId: string | null;
    resolvedProductId: string | null;
    resolvedBatchId: string | null;
    batchCandidates: Array<{ id: string; batchName: string | null; remainingQuantity: string; unitCost: string | null; date: Date }>;
    batchSelectionRequired: boolean;
    unitPrice: number | null;
    totalAmount: number | null;
    priceSource: string;
    priceConflict: { unitPrice: number; total: number; calculatedTotal: number } | null;
    paidAmount: number | null;
    balance: number | null;
    isNewCustomer: boolean;
    isNewProduct: boolean;
    customerCandidates: Array<{ id: string; name: string; phone?: string | null }>;
    productCandidates: Array<{ id: string; name: string; unit?: string | null; sellingPrice?: string | null }>;
    hint: string | null;
  };
  transcript: string | null;
  onConfirm: (input: { customerId: string; productId: string; quantity: number; unitPrice?: number; paidAmount?: number; batchId?: string }) => void;
  onCancel: () => void;
}) {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();
  // Local form state — initialized from the AI-resolved values, fully editable
  const [customerId, setCustomerId] = useState<string>(form.resolvedCustomerId ?? "");
  const [productId, setProductId] = useState<string>(form.resolvedProductId ?? "");
  const [quantityStr, setQuantityStr] = useState<string>(
    form.quantityRaw != null ? String(form.quantityRaw) : ""
  );
  // V3: unit price is editable — initialized from the backend-computed value
  const [unitPriceStr, setUnitPriceStr] = useState<string>(
    form.unitPrice != null ? String(form.unitPrice) : ""
  );
  // V4: paid amount is editable — initialized from the backend-computed value.
  // V7: When no payment was mentioned, the backend defaults to full payment
  // (paidAmount = totalAmount, balance = 0). We pre-fill the payment field
  // with the full amount so the user sees "Fully Paid" instead of a blank
  // field + full outstanding balance.
  // When the user explicitly said a partial payment (or credit = 0), the
  // backend sets paidAmount to that value and we show it.
  const [paidAmountStr, setPaidAmountStr] = useState<string>(
    form.paidAmount != null && form.paidAmount > 0 ? String(form.paidAmount) : ""
  );
  // V5: batch selection — initialized from the backend-resolved batch
  const [batchId, setBatchId] = useState<string>(form.resolvedBatchId ?? "");
  // V3: New customer inline creation
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  // V6: New product inline creation — local mutable copy of productCandidates
  // so we can append the newly-created product without re-running /interpret.
  const [showNewProductWizard, setShowNewProductWizard] = useState(false);
  const [extraProducts, setExtraProducts] = useState<Array<{ id: string; name: string; unit: string | null; sellingPrice: string | null }>>([]);
  // V6: When a product is created with opening stock, also remember its
  // opening-batch StockMove so we can populate the batch picker immediately.
  const [extraBatches, setExtraBatches] = useState<Array<{ id: string; batchName: string | null; remainingQuantity: string; unitCost: string | null; date: Date; productId: string }>>([]);

  // Find the selected product (for unit + default price) — checks both the
  // AI-returned candidates AND any products we created inline this session.
  const allProductCandidates = [...form.productCandidates, ...extraProducts];
  const selectedProduct = allProductCandidates.find((p) => p.id === productId);
  const unit = selectedProduct?.unit ?? form.unitRaw ?? null;
  const defaultProductPrice = selectedProduct?.sellingPrice ? Number(selectedProduct.sellingPrice) : null;

  // V6: All batch candidates for the currently-selected product (from form
  // + any opening-batch StockMove we created inline this session).
  const allBatchCandidates = [
    ...form.batchCandidates,
    ...extraBatches.filter((b) => b.productId === productId),
  ];

  const quantityNum = Number(quantityStr);
  const isValidQuantity = Number.isFinite(quantityNum) && quantityNum > 0;
  const unitPriceNum = Number(unitPriceStr);
  const isValidUnitPrice = Number.isFinite(unitPriceNum) && unitPriceNum > 0;

  // V3: Live calculation — total = qty × unitPrice
  const calculatedTotal = isValidQuantity && isValidUnitPrice
    ? quantityNum * unitPriceNum
    : null;

  // V4: Paid amount + balance calculation
  const paidAmountNum = Number(paidAmountStr || "0");
  const isValidPaidAmount = Number.isFinite(paidAmountNum) && paidAmountNum >= 0;
  const liveBalance = calculatedTotal != null && isValidPaidAmount
    ? calculatedTotal - paidAmountNum
    : null;

  // V3: If the AI provided an explicit total, show it alongside the calculated
  const explicitTotalDisplay = form.explicitTotal ?? null;

  // Validation: customer + product + valid quantity + valid unitPrice all required
  // V5/V6: If batch selection is required and no batch selected → disable submit.
  //   `batchSelectionRequired` is set by the backend based on form.batchCandidates,
  //   but if we created an inline product, allBatchCandidates may have different
  //   contents. Recompute batchSelectionRequired here for the live UI.
  const liveBatchSelectionRequired =
    allBatchCandidates.length > 1 && !batchId;
  const batchValid = !liveBatchSelectionRequired;

  // Validation: customer + product + valid quantity + valid unitPrice + valid batch
  const canSubmit = !!customerId && !!productId && isValidQuantity && isValidUnitPrice && isValidPaidAmount && batchValid;

  const handleSubmit = () => {
    if (!canSubmit) return;
    // V5: pass batchId to the backend
    onConfirm({
      customerId,
      productId,
      quantity: quantityNum,
      unitPrice: unitPriceNum,
      paidAmount: paidAmountNum,
      batchId: batchId || undefined,
    });
  };

  // V3: Price source label for display
  const priceSourceLabel = (() => {
    switch (form.priceSource) {
      case "USER_TOTAL": return t("smartentry.priceSource.userTotal");
      case "USER_UNIT_PRICE": return t("smartentry.priceSource.userUnitPrice");
      case "DEFAULT_PRODUCT_PRICE": return t("smartentry.priceSource.default");
      case "CONFLICT_RESOLVED": return t("smartentry.priceSource.resolved");
      case "MANUAL_INPUT": return t("smartentry.priceSource.manual");
      default: return "";
    }
  })();

  return (
    <div className="space-y-4">
      {/* Transcript — what the user said */}
      {transcript ? (
        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.transcript.youSaid")}</p>
          <p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p>
        </div>
      ) : null}

      {/* V3: Price conflict warning */}
      {form.priceConflict ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">{t("smartentry.priceConflict.title")}</p>
          <p className="mt-1 text-xs">
            {tParams("smartentry.priceConflict.detail", {
              rate: form.priceConflict.unitPrice,
              total: form.priceConflict.total,
              qty: form.quantityRaw ?? "",
              perKg: form.priceConflict.unitPrice,
              calc: form.priceConflict.calculatedTotal,
            })}
          </p>
          <p className="mt-1 text-xs font-medium">{tParams("smartentry.priceConflict.resolution", { total: form.priceConflict.total })}</p>
        </div>
      ) : null}

      {/* V3: New customer prompt — with "Add" button */}
      {form.isNewCustomer && !customerId && !showNewCustomerForm ? (
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-3.5 text-sm text-blue-900">
          <p className="font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4 shrink-0" />
            {t("smartentry.newCustomer.detected")}
          </p>
          <p className="mt-1 text-xs text-blue-700">
            {tParams("smartentry.newCustomer.prompt", { name: form.customerNameRaw ?? "" })}
          </p>
          <button
            type="button"
            onClick={() => {
              setNewCustomerName(form.customerNameRaw ?? "");
              setShowNewCustomerForm(true);
            }}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            {tParams("smartentry.newCustomer.addName", { name: form.customerNameRaw ?? "" })}
          </button>
        </div>
      ) : null}

      {/* V3: Inline new customer creation form */}
      {showNewCustomerForm ? (
        <NewCustomerForm
          name={newCustomerName}
          onCancel={() => {
            setShowNewCustomerForm(false);
            setNewCustomerName("");
            setNewCustomerError(null);
          }}
          onCreated={(createdCustomer) => {
            // Customer was created on the backend — now select it in the form
            // and add it to the candidate list so the picker shows it
            setCustomerId(createdCustomer.id);
            // Also update the candidates list so the picker displays the name
            form.customerCandidates = [
              ...form.customerCandidates,
              { id: createdCustomer.id, name: createdCustomer.name, phone: createdCustomer.phone ?? null },
            ];
            setShowNewCustomerForm(false);
            setNewCustomerName("");
            setNewCustomerError(null);
          }}
        />
      ) : null}

      {/* V6: New product prompt — with "Add Product" + "Choose Another" buttons */}
      {form.isNewProduct && !productId && !showNewProductWizard ? (
        <div className="rounded-xl border border-indigo-300 bg-indigo-50 p-3.5 text-sm text-indigo-900">
          <p className="font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 shrink-0" />
            {t("smartentry.newProduct.detected")}
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            {tParams("smartentry.newProduct.prompt", { name: form.productNameRaw ?? "" })}
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowNewProductWizard(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              {t("smartentry.newProduct.add")}
            </button>
            <button
              type="button"
              onClick={() => setShowNewProductWizard(false)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 active:scale-[0.98]"
            >
              <Package className="h-4 w-4" strokeWidth={2.5} />
              {t("smartentry.newProduct.chooseAnother")}
            </button>
          </div>
        </div>
      ) : null}

      {/* V6: Inline 3-step AddProductWizard */}
      {showNewProductWizard ? (
        <AddProductWizard
          initialName={form.productNameRaw ?? ""}
          initialUnit={form.unitRaw ?? ""}
          initialUnitPrice={form.explicitUnitPrice ?? null}
          onCancel={() => {
            setShowNewProductWizard(false);
          }}
          onCreated={(created) => {
            // Product was created on the backend — now select it in the form
            // and add it to the local candidates list so the picker shows it.
            setProductId(created.product.id);
            setExtraProducts((prev) => [
              ...prev,
              {
                id: created.product.id,
                name: created.product.name,
                unit: created.product.unit,
                sellingPrice: created.product.sellingPrice,
              },
            ]);
            // If an opening-batch StockMove was created, also remember it
            // so the batch picker can show it immediately.
            if (created.stockMove) {
              setExtraBatches((prev) => [
                ...prev,
                {
                  id: created.stockMove!.id,
                  batchName: created.stockMove!.batchName,
                  remainingQuantity: created.stockMove!.remainingQuantity,
                  unitCost: created.stockMove!.unitCost,
                  date: created.stockMove!.date,
                  productId: created.product.id,
                },
              ]);
              // Auto-select the opening batch (it's the only one for this new product)
              setBatchId(created.stockMove.id);
            }
            // If the new product's selling price is set, also update the unit
            // price field (so the user sees the default rate, not blank).
            // BUT: if the AI provided an explicit unit price for this
            // transaction, keep that — it overrides the default.
            if (
              created.product.sellingPrice &&
              Number(created.product.sellingPrice) > 0 &&
              !form.explicitUnitPrice
            ) {
              setUnitPriceStr(String(created.product.sellingPrice));
            }
            setShowNewProductWizard(false);
          }}
        />
      ) : null}

      {/* Hint */}
      {form.hint && !showNewProductWizard && !showNewCustomerForm ? (
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
        <Field label={t("smartentry.field.customer")} isFilled={!!customerId}>
          <SearchablePicker
            value={customerId}
            onChange={setCustomerId}
            candidates={form.customerCandidates}
            placeholder={form.customerNameRaw ?? t("smartentry.placeholder.searchCustomer")}
            emptyText={t("smartentry.empty.noCustomers")}
          />
        </Field>

        {/* Product picker */}
        <Field label={t("smartentry.field.product")} isFilled={!!productId}>
          <SearchablePicker
            value={productId}
            onChange={(id) => {
              setProductId(id);
              // Reset batch selection when product changes — the new product
              // may have different batches (or none).
              setBatchId("");
            }}
            candidates={allProductCandidates}
            placeholder={form.productNameRaw ?? t("smartentry.placeholder.searchProduct")}
            emptyText={t("smartentry.empty.noProducts")}
            getSubtitle={(p) => p.unit ? `${p.unit}${p.sellingPrice ? ` · ${symbol} ${p.sellingPrice}` : ""}` : null}
          />
        </Field>

        {/* V5/V6: Batch selector — shown when the selected product has stock batches */}
        {allBatchCandidates.length > 0 ? (
          <Field
            label={liveBatchSelectionRequired ? t("smartentry.field.batchRequired") : t("smartentry.field.batch")}
            isFilled={!!batchId}
          >
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 ${
                liveBatchSelectionRequired && !batchId
                  ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500/30"
                  : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30"
              }`}
            >
              <option value="">
                {liveBatchSelectionRequired ? t("smartentry.batch.selectPrompt") : t("smartentry.batch.auto")}
              </option>
              {allBatchCandidates.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchName ?? `Batch ${new Date(b.date).toLocaleDateString()}`}
                  {" — "}{symbol} {b.unitCost ?? "?"}/unit
                  {" — "}{tParams("smartentry.batch.remaining", { qty: b.remainingQuantity })}
                </option>
              ))}
            </select>
            {liveBatchSelectionRequired && !batchId ? (
              <p className="mt-1 text-xs text-amber-600">{t("smartentry.batch.selectError")}</p>
            ) : null}
          </Field>
        ) : null}

        {/* Quantity + Unit */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t("smartentry.field.quantity")} isFilled={isValidQuantity}>
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
          <Field label={t("smartentry.field.unit")} isFilled={!!unit}>
            <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
              {unit ?? "—"}
            </div>
          </Field>
        </div>

        {/* V3: Unit Price — editable */}
        <Field
          label={`${t("smartentry.field.unitPrice")}${priceSourceLabel ? ` (${priceSourceLabel})` : ""}`}
          isFilled={isValidUnitPrice}
        >
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={unitPriceStr}
            onChange={(e) => setUnitPriceStr(e.target.value)}
            placeholder={defaultProductPrice != null ? String(defaultProductPrice) : "0"}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </Field>

        {/* V4: Payment + Balance section */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          {/* Total Amount */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("smartentry.field.totalAmount")}</span>
            <span className="text-lg font-bold text-slate-900">
              {calculatedTotal != null ? formatMoney(calculatedTotal) : "—"}
            </span>
          </div>

          {/* Amount Paid (editable) */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("smartentry.field.amountPaid")}</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={paidAmountStr}
              onChange={(e) => setPaidAmountStr(e.target.value)}
              placeholder="0"
              className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {/* Divider */}
          <div className="border-t-2 border-dashed border-slate-100" />

          {/* Balance — HE OWES US / WE OWE HIM / FULLY PAID */}
          {liveBalance != null ? (
            liveBalance > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("smartentry.balance.heOwesUs")}</span>
                <span className="text-lg font-bold text-amber-700">{formatMoney(liveBalance)}</span>
              </div>
            ) : liveBalance < 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-blue-700">{t("smartentry.balance.weOweHim")}</span>
                <span className="text-lg font-bold text-blue-700">{formatMoney(Math.abs(liveBalance))}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-green-700">{t("smartentry.balance.fullyPaid")}</span>
                <span className="text-lg font-bold text-green-700">{formatMoney(0)}</span>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("smartentry.field.balance")}</span>
              <span className="text-lg font-bold text-slate-400">—</span>
            </div>
          )}

          {/* Show explicit total if the user said one and it differs */}
          {explicitTotalDisplay != null && calculatedTotal != null &&
           Math.abs(explicitTotalDisplay - calculatedTotal) > 1 ? (
            <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
              {tParams("smartentry.explicitTotal.detail", {
                total: `${symbol} ${explicitTotalDisplay.toLocaleString()}`,
                rate: `${symbol} ${(explicitTotalDisplay / quantityNum).toFixed(2)}/${unit}`,
              })}
            </p>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
        >
          {t("smartentry.action.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-colors hover:bg-brand-700 active:scale-[0.98] disabled:bg-brand-300 disabled:shadow-none"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" />
            {t("smartentry.action.addToKhata")}
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
  const { t } = useLanguage();
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
                placeholder={t("smartentry.placeholder.search")}
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
                {t("smartentry.action.close")}
                </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

// ── NewCustomerForm ─────────────────────────────────────────────────────────
// Inline customer creation form shown inside the Smart Entry modal.
// Calls POST /api/customers to create the customer on the backend.

function NewCustomerForm({
  name: initialName,
  onCancel,
  onCreated,
}: {
  name: string;
  onCancel: () => void;
  onCreated: (customer: { id: string; name: string; phone: string | null }) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t("smartentry.validation.nameRequired"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          openingBalance: 0,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? t("smartentry.error.createCustomerFailed"));
        return;
      }
      // Success — call onCreated with the new customer
      onCreated({
        id: json.data.id,
        name: json.data.name,
        phone: json.data.phone ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("smartentry.error.network"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <UserPlus className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">{t("smartentry.newCustomer.title")}</h3>
      </div>

      {/* Name field */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.name")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("smartentry.placeholder.customerName")}
          autoFocus
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* Phone field (optional) */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.phone")} <span className="text-slate-400">({t("common.optional")})</span></label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("smartentry.placeholder.phone")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* Error message */}
      {error ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t("smartentry.action.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim()}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] disabled:bg-blue-300"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("smartentry.action.adding")}
            </span>
          ) : (
            t("smartentry.action.addCustomer")
          )}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AddProductWizard — V6 (Smart Entry)
//
// 3-step inline wizard shown inside the Smart Entry modal when the user
// mentions a product that doesn't exist in their inventory.
//
//   Step 1 — Product Details:   Name (prefilled), Category, Unit (with
//                                custom-unit add), SKU
//   Step 2 — Prices & Stock:    Purchase Price, Selling Price, Opening Stock
//                                (NEVER prefilled from transaction qty),
//                                Low-stock Threshold
//   Step 3 — Review & Create:   Summary card + Create Product button + Back
//
// CRITICAL: opening stock is NEVER pre-filled from the transaction quantity.
// The user saying "Ahmad bought 25 kg rice" describes a SALE, not inventory.
// ════════════════════════════════════════════════════════════════════════════

const PRODUCT_UNITS = ["piece", "kg", "box", "dozen", "litre", "metre", "pack", "bag", "bottle", "carton"];

type AddProductWizardProps = {
  initialName: string;
  initialUnit: string;
  initialUnitPrice: number | null;
  onCancel: () => void;
  onCreated: (created: {
    product: {
      id: string;
      name: string;
      unit: string;
      sellingPrice: string;
      purchasePrice: string;
      category: string | null;
      sku: string | null;
      openingStock: string;
      lowStockThreshold: number;
    };
    stockMove: {
      id: string;
      batchName: string | null;
      remainingQuantity: string;
      unitCost: string | null;
      date: Date;
    } | null;
  }) => void;
};

type WizardStep = 1 | 2 | 3;

function AddProductWizard({
  initialName,
  initialUnit,
  initialUnitPrice,
  onCancel,
  onCreated,
}: AddProductWizardProps) {
  const { t, tParams } = useLanguage();
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 fields
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState<string>(
    initialUnit && PRODUCT_UNITS.includes(initialUnit) ? initialUnit : "piece"
  );
  const [sku, setSku] = useState("");
  const [showCustomUnitInput, setShowCustomUnitInput] = useState(false);
  const [customUnitInput, setCustomUnitInput] = useState("");
  const [customUnitError, setCustomUnitError] = useState<string | null>(null);
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [addingCustomUnit, setAddingCustomUnit] = useState(false);

  // Step 2 fields — pre-fill prices from AI's explicitUnitPrice if provided.
  // CRITICAL: opening stock is NEVER pre-filled from the transaction quantity.
  const initialPriceStr = initialUnitPrice != null ? String(initialUnitPrice) : "";
  const [purchasePrice, setPurchasePrice] = useState<string>(initialPriceStr);
  const [sellingPrice, setSellingPrice] = useState<string>(initialPriceStr);
  const [openingStock, setOpeningStock] = useState<string>("");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allUnits = Array.from(new Set([...PRODUCT_UNITS, ...customUnits]));

  // Step 1 validation
  const step1Errors: { name?: string; unit?: string } = {};
  if (!name.trim()) step1Errors.name = t("smartentry.validation.nameRequired");
  if (!unit.trim()) step1Errors.unit = t("smartentry.validation.unitRequired");
  const step1HasErrors = !!step1Errors.name || !!step1Errors.unit;
  const step1CanContinue = !step1HasErrors;

  // Step 2 validation
  const step2Errors: {
    purchasePrice?: string;
    sellingPrice?: string;
    openingStock?: string;
    lowStockThreshold?: string;
  } = {};

  const pp = parseDecimalSafe(purchasePrice);
  if (!purchasePrice || pp.lt(0) || !pp.isFinite()) {
    step2Errors.purchasePrice = t("smartentry.validation.purchasePrice");
  }
  const sp = parseDecimalSafe(sellingPrice);
  if (!sellingPrice || sp.lt(0) || !sp.isFinite()) {
    step2Errors.sellingPrice = t("smartentry.validation.sellingPrice");
  }
  const os = parseDecimalSafe(openingStock || "0");
  if (openingStock && (os.lt(0) || !os.isFinite())) {
    step2Errors.openingStock = t("smartentry.validation.openingStock");
  }
  const lst = parseInt(lowStockThreshold, 10);
  if (!Number.isFinite(lst) || lst < 0) {
    step2Errors.lowStockThreshold = t("smartentry.validation.lowStockThreshold");
  }
  const step2HasErrors =
    !!step2Errors.purchasePrice || !!step2Errors.sellingPrice ||
    !!step2Errors.openingStock || !!step2Errors.lowStockThreshold;
  const step2CanContinue = !step2HasErrors;

  // Step 3: live totals
  const openingStockNum = openingStock ? Number(openingStock) : 0;
  const purchasePriceNum = purchasePrice ? Number(purchasePrice) : 0;
  const totalOpeningCost = Number.isFinite(openingStockNum) && Number.isFinite(purchasePriceNum)
    ? openingStockNum * purchasePriceNum
    : 0;

  // Add custom unit
  const handleAddCustomUnit = async () => {
    const trimmed = customUnitInput.trim().toLowerCase();
    if (!trimmed) {
      setCustomUnitError(t("smartentry.validation.unitNameRequired"));
      return;
    }
    if (trimmed.length > 20) {
      setCustomUnitError(t("smartentry.validation.unitNameTooLong"));
      return;
    }
    if (allUnits.includes(trimmed)) {
      setCustomUnitError(tParams("smartentry.validation.unitExists", { name: trimmed }));
      return;
    }
    setAddingCustomUnit(true);
    setCustomUnitError(null);
    try {
      const res = await fetch("/api/settings/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: trimmed }),
      });
      const json = await res.json();
      if (!json.ok) {
        setCustomUnitError(json.error?.message ?? t("smartentry.error.addUnitFailed"));
        return;
      }
      setCustomUnits(json.data.customUnits ?? []);
      setUnit(trimmed);
      setCustomUnitInput("");
      setShowCustomUnitInput(false);
    } catch (e) {
      setCustomUnitError(e instanceof Error ? e.message : t("smartentry.error.network"));
    } finally {
      setAddingCustomUnit(false);
    }
  };

  // Create product
  const handleCreate = async () => {
    if (step1HasErrors || step2HasErrors) {
      setError(t("smartentry.validation.fixErrors"));
      setStep(step1HasErrors ? 1 : 2);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        category: category.trim() || null,
        purchasePrice: pp.toNumber(),
        sellingPrice: sp.toNumber(),
        unit: unit.trim(),
        sku: sku.trim() || null,
        openingStock: openingStock ? parseDecimalSafe(openingStock).toNumber() : 0,
        lowStockThreshold: lst,
      };
      const res = await fetch("/api/products/with-opening-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? t("smartentry.error.createProductFailed"));
        return;
      }
      onCreated({
        product: {
          id: json.data.product.id,
          name: json.data.product.name,
          unit: json.data.product.unit,
          sellingPrice: json.data.product.sellingPrice,
          purchasePrice: json.data.product.purchasePrice,
          category: json.data.product.category,
          sku: json.data.product.sku,
          openingStock: json.data.product.openingStock,
          lowStockThreshold: json.data.product.lowStockThreshold,
        },
        stockMove: json.data.stockMove ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("smartentry.error.networkRetry"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Package className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">{t("smartentry.newProduct.title")}</h3>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-1.5 flex-1">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                step >= s
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-200 text-slate-500",
              )}
            >
              {step > s ? <Check className="h-3 w-3" strokeWidth={3} /> : s}
            </div>
            {s < 3 ? (
              <div className={cn("h-0.5 flex-1", step > s ? "bg-indigo-600" : "bg-slate-200")} />
            ) : null}
          </div>
        ))}
      </div>

      {/* Step 1 — Product Details */}
      {step === 1 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-600">{t("smartentry.wizard.step1")}</p>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t("smartentry.field.name")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("smartentry.placeholder.productName")}
              autoFocus
              className={cn(
                "w-full rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2",
                step1Errors.name
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                  : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/30",
              )}
            />
            {step1Errors.name ? (
              <p className="mt-1 text-xs text-red-600">{step1Errors.name}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t("smartentry.field.category")} <span className="text-slate-400">({t("common.optional")})</span>
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("smartentry.placeholder.category")}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("smartentry.field.unit")} <span className="text-red-500">*</span>
              </label>
              <select
                value={unit}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setShowCustomUnitInput(true);
                  } else {
                    setUnit(e.target.value);
                    setShowCustomUnitInput(false);
                  }
                }}
                className={cn(
                  "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2",
                  step1Errors.unit
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/30",
                )}
              >
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                {customUnits.map((u) => (
                  <option key={u} value={u}>{tParams("smartentry.unit.custom", { name: u })}</option>
                ))}
                <option value="__custom__">{t("smartentry.unit.addNew")}</option>
              </select>
              {step1Errors.unit ? (
                <p className="mt-1 text-xs text-red-600">{step1Errors.unit}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("smartentry.field.sku")} <span className="text-slate-400">({t("common.optional")})</span>
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder={t("smartentry.placeholder.sku")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
          </div>

          {showCustomUnitInput ? (
            <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-2">
              <label className="block text-xs font-medium text-slate-600">{t("smartentry.unit.newName")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customUnitInput}
                  onChange={(e) => setCustomUnitInput(e.target.value)}
                  placeholder={t("smartentry.placeholder.customUnit")}
                  maxLength={20}
                  autoFocus
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomUnit();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomUnit}
                  disabled={addingCustomUnit || !customUnitInput.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                  {addingCustomUnit ? <Loader2 className="h-4 w-4 animate-spin" /> : t("smartentry.action.add")}
                </button>
              </div>
              {customUnitError ? (
                <p className="text-xs text-red-600">{customUnitError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setShowCustomUnitInput(false);
                  setCustomUnitInput("");
                  setCustomUnitError(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                {t("smartentry.action.cancel")}
              </button>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t("smartentry.action.cancel")}
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!step1CanContinue}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] disabled:bg-indigo-300"
            >
              {t("smartentry.action.next")}
              <ArrowRight className="h-4 w-4 rtl-flip" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 2 — Prices & Opening Stock */}
      {step === 2 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-600">{t("smartentry.wizard.step2")}</p>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("smartentry.field.purchasePrice")} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0"
                className={cn(
                  "w-full rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2",
                  step2Errors.purchasePrice
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/30",
                )}
              />
              {step2Errors.purchasePrice ? (
                <p className="mt-1 text-xs text-red-600">{step2Errors.purchasePrice}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("smartentry.field.sellingPrice")} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0"
                className={cn(
                  "w-full rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2",
                  step2Errors.sellingPrice
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/30",
                )}
              />
              {step2Errors.sellingPrice ? (
                <p className="mt-1 text-xs text-red-600">{step2Errors.sellingPrice}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t("smartentry.field.openingStock")} <span className="text-slate-400">({t("smartentry.field.openingStockHint")})</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={openingStock}
              onChange={(e) => setOpeningStock(e.target.value)}
              placeholder="0"
              className={cn(
                "w-full rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2",
                step2Errors.openingStock
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                  : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/30",
              )}
            />
            {step2Errors.openingStock ? (
              <p className="mt-1 text-xs text-red-600">{step2Errors.openingStock}</p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                {tParams("smartentry.wizard.openingStockHelp", { name: name.trim() || t("smartentry.newProduct.title") })}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.lowStockThreshold")}</label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              className={cn(
                "w-full rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2",
                step2Errors.lowStockThreshold
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                  : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/30",
              )}
            />
            {step2Errors.lowStockThreshold ? (
              <p className="mt-1 text-xs text-red-600">{step2Errors.lowStockThreshold}</p>
            ) : null}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4 rtl-flip" />
              {t("smartentry.action.back")}
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!step2CanContinue}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] disabled:bg-indigo-300"
            >
              {t("smartentry.action.review")}
              <ArrowRight className="h-4 w-4 rtl-flip" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 3 — Review & Create */}
      {step === 3 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-600">{t("smartentry.wizard.step3")}</p>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{name.trim() || "—"}</p>
                <p className="text-xs text-slate-500">{unit}{category ? ` · ${category.trim()}` : ""}</p>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                {t("smartentry.action.edit")}
              </button>
            </div>
            <div className="h-px bg-slate-100" />
            <ReviewRow label={t("smartentry.field.purchasePrice")} value={pp.toNumber() > 0 ? formatMoney(pp.toNumber()) : "—"} />
            <ReviewRow label={t("smartentry.field.sellingPrice")} value={sp.toNumber() > 0 ? formatMoney(sp.toNumber()) : "—"} />
            <ReviewRow
              label={t("smartentry.field.openingStock")}
              value={openingStock ? `${openingStock} ${unit}` : t("smartentry.wizard.addLater")}
            />
            {openingStock && pp.toNumber() > 0 ? (
              <div className="h-px bg-slate-100" />
            ) : null}
            {openingStock && pp.toNumber() > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">{t("smartentry.wizard.totalOpeningCost")}</span>
                <span className="text-sm font-bold text-indigo-700">{formatMoney(totalOpeningCost)}</span>
              </div>
            ) : null}
            <div className="h-px bg-slate-100" />
            <ReviewRow label={t("smartentry.field.lowStockThreshold")} value={String(lst)} />
            {sku.trim() ? <ReviewRow label={t("smartentry.field.sku")} value={sku.trim()} /> : null}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4 rtl-flip" />
              {t("smartentry.action.back")}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] disabled:bg-indigo-300"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("smartentry.action.creating")}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" strokeWidth={3} />
                  {t("smartentry.action.createProduct")}
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

// Tiny decimal parser — kept local so the Smart Entry bundle is self-contained.
function parseDecimalSafe(value: string): { lt(n: number): boolean; gt(n: number): boolean; isFinite(): boolean; toNumber(): number } {
  if (!value || value.trim() === "") {
    return { lt: () => false, gt: () => false, isFinite: () => true, toNumber: () => 0 };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { lt: () => false, gt: () => false, isFinite: () => false, toNumber: () => 0 };
  }
  return {
    lt: (cmp: number) => n < cmp,
    gt: (cmp: number) => n > cmp,
    isFinite: () => true,
    toNumber: () => n,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// V10: ExpenseFormView — for CREATE_EXPENSE intent
// ════════════════════════════════════════════════════════════════════════════

function ExpenseFormView({
  form,
  transcript,
  sessionId,
  onConfirm,
  onCancel,
}: {
  form: {
    expenseName: string | null;
    amount: number | null;
    category: string;
    notes: string | null;
    date: string | null;
  };
  transcript: string | null;
  sessionId: string | null;
  onConfirm: (input: {
    intentType: string;
    expenseName: string;
    amount: number;
    expenseCategory: string;
    notes: string | null;
    date: string;
  }) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  const [name, setName] = useState(form.expenseName ?? "");
  const [amountStr, setAmountStr] = useState(form.amount != null ? String(form.amount) : "");
  const [category, setCategory] = useState(form.category ?? "other");
  const [notes, setNotes] = useState(form.notes ?? "");
  const [date, setDate] = useState(
    form.date ? new Date(form.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  const amountNum = Number(amountStr);
  const isValidAmount = Number.isFinite(amountNum) && amountNum > 0;
  const canSubmit = !!name.trim() && isValidAmount;

  const CATEGORIES = [
    { value: "transport", label: t("expense.transport"), icon: "🚚" },
    { value: "shop", label: t("expense.shop"), icon: "🏪" },
    { value: "electricity", label: t("expense.electricity"), icon: "💡" },
    { value: "packaging", label: t("expense.packaging"), icon: "📦" },
    { value: "salary", label: t("expense.salary"), icon: "👷" },
    { value: "rent", label: t("expense.rent"), icon: "🏠" },
    { value: "other", label: t("payment.other"), icon: "•" },
  ];

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      intentType: "CREATE_EXPENSE",
      expenseName: name.trim(),
      amount: amountNum,
      expenseCategory: category,
      notes: notes.trim() || null,
      date: new Date(date).toISOString(),
    });
  };

  return (
    <div className="space-y-4">
      {transcript ? (
        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.transcript.youSaid")}</p>
          <p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p>
        </div>
      ) : null}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("smartentry.expense.name")} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("smartentry.expense.namePlaceholder")}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("smartentry.field.amount")} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">{symbol}</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-lg font-bold tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">{t("smartentry.field.category")}</label>
          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border py-2 text-[11px] font-medium transition-colors",
                  category === cat.value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                <span className="text-base leading-none">{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.date")}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.notes")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("smartentry.placeholder.notes")}
            rows={2}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
        >
          {t("smartentry.action.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-colors hover:bg-brand-700 active:scale-[0.98] disabled:bg-brand-300 disabled:shadow-none"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" />
            {t("smartentry.action.saveExpense")}
          </span>
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// V10: PaymentFormView — for RECORD_PAYMENT intent
// ════════════════════════════════════════════════════════════════════════════

function PaymentFormView({
  form,
  transcript,
  onConfirm,
  onCancel,
}: {
  form: {
    customerNameRaw: string | null;
    resolvedCustomerId: string | null;
    amount: number | null;
    method: string;
    notes: string | null;
    date: string | null;
    isNewCustomer: boolean;
    customerCandidates: Array<{ id: string; name: string; phone?: string | null }>;
    customerBalance: string | null;
  };
  transcript: string | null;
  onConfirm: (input: {
    intentType: string;
    customerId: string;
    amount: number;
    method: string;
    notes: string | null;
    date: string;
  }) => void;
  onCancel: () => void;
}) {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();
  const [customerId, setCustomerId] = useState(form.resolvedCustomerId ?? "");
  const [amountStr, setAmountStr] = useState(form.amount != null ? String(form.amount) : "");
  const [method, setMethod] = useState(form.method ?? "cash");
  const [notes, setNotes] = useState(form.notes ?? "");
  const [date, setDate] = useState(
    form.date ? new Date(form.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  const amountNum = Number(amountStr);
  const isValidAmount = Number.isFinite(amountNum) && amountNum > 0;
  const canSubmit = !!customerId && isValidAmount;

  // V12: Compute remaining balance after this payment
  const currentBalance = form.customerBalance ? Number(form.customerBalance) : null;
  const remainingBalance = currentBalance != null && isValidAmount
    ? currentBalance - amountNum
    : currentBalance;

  const METHODS = [
    { value: "cash", label: t("smartentry.payment.method.cash"), icon: "💵" },
    { value: "bank", label: t("smartentry.payment.method.bank"), icon: "🏦" },
    { value: "cheque", label: t("smartentry.payment.method.cheque"), icon: "📝" },
    { value: "jazzcash", label: t("smartentry.payment.method.jazzcash"), icon: "📱" },
    { value: "easypaisa", label: t("smartentry.payment.method.easypaisa"), icon: "📱" },
    { value: "other", label: t("smartentry.payment.method.other"), icon: "•" },
  ];

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      intentType: "RECORD_PAYMENT",
      customerId,
      amount: amountNum,
      method,
      notes: notes.trim() || null,
      date: new Date(date).toISOString(),
    });
  };

  return (
    <div className="space-y-4">
      {transcript ? (
        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.transcript.youSaid")}</p>
          <p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p>
        </div>
      ) : null}

      {form.isNewCustomer && !customerId ? (
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-3.5 text-sm text-blue-900">
          <p className="font-semibold">{t("smartentry.newCustomer.detected")}</p>
          <p className="mt-1 text-xs text-blue-700">
            {tParams("smartentry.payment.newCustomerPrompt", { name: form.customerNameRaw ?? "" })}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        <Field label={t("smartentry.field.customer")} isFilled={!!customerId}>
          <SearchablePicker
            value={customerId}
            onChange={setCustomerId}
            candidates={form.customerCandidates}
            placeholder={form.customerNameRaw ?? t("smartentry.placeholder.searchCustomer")}
            emptyText={t("smartentry.payment.noCustomers")}
          />
        </Field>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("smartentry.payment.amountReceived")} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">{symbol}</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-lg font-bold tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        {/* V12: Outstanding balance + remaining balance display */}
        {currentBalance != null ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("smartentry.payment.outstanding")}</span>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                currentBalance > 0 ? "text-amber-700" : currentBalance < 0 ? "text-blue-700" : "text-green-700",
              )}>
                {currentBalance > 0
                  ? `${symbol} ${currentBalance.toLocaleString()} ${t("smartentry.payment.owesYou")}`
                  : currentBalance < 0
                  ? `${symbol} ${Math.abs(currentBalance).toLocaleString()} ${t("smartentry.payment.advance")}`
                  : t("smartentry.payment.settled")}
              </span>
            </div>
            {isValidAmount && remainingBalance != null ? (
              <>
                <div className="border-t-2 border-dashed border-slate-100" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("smartentry.payment.afterPayment")}</span>
                  {remainingBalance > 0 ? (
                    <span className="text-lg font-bold tabular-nums text-amber-700">
                      {symbol} {remainingBalance.toLocaleString()} {t("smartentry.payment.remaining")}
                    </span>
                  ) : remainingBalance < 0 ? (
                    <span className="text-lg font-bold tabular-nums text-blue-700">
                      {symbol} {Math.abs(remainingBalance).toLocaleString()} {t("smartentry.payment.advance")}
                    </span>
                  ) : (
                    <span className="text-lg font-bold tabular-nums text-green-700">
                      {t("smartentry.payment.fullySettled")}
                    </span>
                  )}
                </div>
              </>
            ) : null}
            {currentBalance > 0 && isValidAmount && amountNum > currentBalance ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                {tParams("smartentry.payment.overpaymentWarn", { paid: amountNum.toLocaleString(), outstanding: currentBalance.toLocaleString() })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">{t("smartentry.payment.method")}</label>
          <div className="grid grid-cols-3 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border py-2 text-xs font-medium transition-colors",
                  method === m.value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                <span className="text-base leading-none">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.date")}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.notes")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("smartentry.placeholder.notes")}
            rows={2}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
        >
          {t("smartentry.action.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-colors hover:bg-brand-700 active:scale-[0.98] disabled:bg-brand-300 disabled:shadow-none"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" />
            {t("smartentry.action.savePayment")}
          </span>
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// V10: QueryResultView — for QUERY intent (read-only result display)
// ════════════════════════════════════════════════════════════════════════════

function QueryResultView({
  result,
  transcript,
  onDone,
}: {
  result: {
    queryType: string;
    queryEntity: string | null;
    queryDateRange: string | null;
    result: string;
    data: unknown;
  };
  transcript: string | null;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  return (
    <div className="space-y-4">
      {transcript ? (
        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.query.youAsked")}</p>
          <p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 text-center">
        <div className="mb-3 flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-brand-100">
          <Sparkles className="h-7 w-7 text-brand-600" />
        </div>
        <p className="text-sm font-medium text-slate-500">{t("smartentry.query.result")}</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{result.result}</p>

        {Array.isArray(result.data) && result.data.length > 0 ? (
          <div className="mt-4 space-y-1.5 text-left">
            {result.data.slice(0, 10).map((item: Record<string, unknown> & {
              name?: string;
              product?: string;
              balance?: string | number;
              stock?: string | number;
              amount?: string | number;
              days?: string | number;
              href?: string;
            }, i: number) => {
              const label = item.name ?? item.product ?? JSON.stringify(item).slice(0, 50);
              const value =
                item.balance != null
                  ? `${symbol} ${Number(item.balance).toLocaleString()}`
                  : item.amount != null
                    ? `${symbol} ${Number(item.amount).toLocaleString()}`
                    : item.stock != null
                      ? `${item.stock} ${t("smartentry.query.unitsSuffix")}`
                      : item.days != null
                        ? `${item.days} ${t("smartentry.query.daysSuffix")}`
                        : "";

              const row = (
                <>
                  <span className="min-w-0 flex-1 text-left font-medium text-slate-700">
                    {label}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-900">{value}</span>
                </>
              );

              // Rows that point at a record can be opened straight from the
              // answer — the owner never has to copy a name and search for it.
              return item.href ? (
                <Link
                  key={i}
                  href={item.href}
                  onClick={onDone}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-3 py-2 text-sm hover:bg-white"
                >
                  {row}
                </Link>
              ) : (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-3 py-2 text-sm"
                >
                  {row}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 active:scale-[0.98]"
      >
        {t("smartentry.action.done")}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// V11: StockIntakeFormView — for STOCK_INTAKE intent
// ════════════════════════════════════════════════════════════════════════════

function StockIntakeFormView({
  form,
  transcript,
  onConfirm,
  onCancel,
}: {
  form: {
    productNameRaw: string | null;
    resolvedProductId: string | null;
    quantity: number | null;
    unit: string | null;
    unitCost: number | null;
    batchName: string | null;
    date: string | null;
    isNewProduct: boolean;
    productCandidates: Array<{ id: string; name: string; unit?: string | null; sellingPrice?: string | null }>;
  };
  transcript: string | null;
  onConfirm: (input: {
    intentType: string;
    productId: string;
    quantity: number;
    unitCost?: number;
    batchName?: string | null;
    date: string;
  }) => void;
  onCancel: () => void;
}) {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();
  const [productId, setProductId] = useState(form.resolvedProductId ?? "");
  const [quantityStr, setQuantityStr] = useState(form.quantity != null ? String(form.quantity) : "");
  const [unitCostStr, setUnitCostStr] = useState(form.unitCost != null ? String(form.unitCost) : "");
  const [batchName, setBatchName] = useState(form.batchName ?? "");
  const [date, setDate] = useState(
    form.date ? new Date(form.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  const quantityNum = Number(quantityStr);
  const isValidQuantity = Number.isFinite(quantityNum) && quantityNum > 0;
  const unitCostNum = Number(unitCostStr);
  const isValidUnitCost = !unitCostStr || (Number.isFinite(unitCostNum) && unitCostNum >= 0);
  const canSubmit = !!productId && isValidQuantity && isValidUnitCost;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      intentType: "STOCK_INTAKE",
      productId,
      quantity: quantityNum,
      unitCost: unitCostStr ? unitCostNum : undefined,
      batchName: batchName.trim() || null,
      date: new Date(date).toISOString(),
    });
  };

  return (
    <div className="space-y-4">
      {transcript ? (
        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.transcript.youSaid")}</p>
          <p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p>
        </div>
      ) : null}

      {form.isNewProduct && !productId ? (
        <div className="rounded-xl border border-indigo-300 bg-indigo-50 p-3.5 text-sm text-indigo-900">
          <p className="font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 shrink-0" />
            {t("smartentry.newProduct.detected")}
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            {tParams("smartentry.stock.newProductPrompt", { name: form.productNameRaw ?? "" })}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        <Field label={t("smartentry.field.product")} isFilled={!!productId}>
          <SearchablePicker
            value={productId}
            onChange={setProductId}
            candidates={form.productCandidates}
            placeholder={form.productNameRaw ?? t("smartentry.placeholder.searchProduct")}
            emptyText={t("smartentry.stock.noProducts")}
            getSubtitle={(p) => p.unit ? `${p.unit}${p.sellingPrice ? ` · ${symbol} ${p.sellingPrice}` : ""}` : null}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t("smartentry.field.quantity")} isFilled={isValidQuantity}>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </Field>
          <Field label={t("smartentry.stock.unitCost")} isFilled={!!unitCostStr}>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={unitCostStr}
              onChange={(e) => setUnitCostStr(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </Field>
        </div>

        <Field label={t("smartentry.stock.batchName")} isFilled={!!batchName.trim()}>
          <input
            type="text"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder={t("smartentry.stock.batchNamePlaceholder")}
            maxLength={100}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </Field>

        <Field label={t("smartentry.field.date")} isFilled={!!date}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
        >
          {t("smartentry.action.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-colors hover:bg-brand-700 active:scale-[0.98] disabled:bg-brand-300 disabled:shadow-none"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" />
            {t("smartentry.action.addStock")}
          </span>
        </button>
      </div>
    </div>
  );
}

function SuccessState({
  message,
  saleId,
  productId,
  customerId,
  onDone,
}: {
  message: string;
  saleId: string | null;
  productId: string | null;
  customerId: string | null;
  onDone: () => void;
}) {
  const { t } = useLanguage();
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
        <p className="text-lg font-bold text-slate-900">{t("smartentry.success.title")}</p>
        <p className="mt-1 text-sm text-slate-600">{message}</p>
      </div>
      <div className="flex w-full gap-2">
        {saleId ? (
          <Link
            href={`/sales/${saleId}`}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("smartentry.action.viewSale")}
          </Link>
        ) : null}
        {productId ? (
          <Link
            href={`/more/products/${productId}`}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("smartentry.action.viewSale")}
          </Link>
        ) : null}
        {customerId ? (
          <Link
            href={`/khata/${customerId}`}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("smartentry.action.viewSale")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {t("smartentry.action.done")}
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
  const { t } = useLanguage();
  const title =
    state === "denied" ? t("smartentry.micError.deniedTitle")
    : state === "unsupported" ? t("smartentry.micError.unsupportedTitle")
    : t("smartentry.micError.unavailableTitle");
  const helpText =
    state === "denied"
      ? t("smartentry.micError.deniedHelp")
      : state === "unsupported"
      ? t("smartentry.micError.unsupportedHelp")
      : t("smartentry.micError.unavailableHelp");

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
          {t("smartentry.action.tryMicAgain")}
        </button>
        <button
          type="button"
          onClick={onUseText}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
        >
          <Type className="h-4 w-4" />
          {t("smartentry.action.typeInstead")}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// V13: ProductCreationView — for CREATE_PRODUCT intent
// ════════════════════════════════════════════════════════════════════════════

function ProductCreationView({ form, transcript, onConfirm, onCancel }: {
  form: { name: string | null; unit: string | null; category: string | null; sku: string | null; purchasePrice: number | null; sellingPrice: number | null; openingStock: number | null; lowStockThreshold: number; hint: string | null; mentionedStock: boolean; };
  transcript: string | null;
  onConfirm: (input: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const { data: settings } = useSettings();
  const [name, setName] = useState(form.name ?? "");
  const [unit, setUnit] = useState(form.unit ?? "piece");
  const [purchasePrice, setPurchasePrice] = useState(form.purchasePrice != null ? String(form.purchasePrice) : "");
  const [sellingPrice, setSellingPrice] = useState(form.sellingPrice != null ? String(form.sellingPrice) : "");
  const [openingStock, setOpeningStock] = useState(form.openingStock != null ? String(form.openingStock) : "");
  const [lowStockThreshold, setLowStockThreshold] = useState(String(form.lowStockThreshold ?? 5));
  const pp = Number(purchasePrice); const sp = Number(sellingPrice);
  const isValid = name.trim() && unit.trim() && Number.isFinite(pp) && pp >= 0 && Number.isFinite(sp) && sp >= 0;
  const units = Array.from(
    new Set(["piece", ...(settings?.customUnits ?? []), ...(unit ? [unit] : [])]),
  );

  return (
    <div className="space-y-4">
      {transcript ? <div className="rounded-xl bg-slate-50 p-3.5"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.transcript.youSaid")}</p><p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p></div> : null}
      {form.hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertCircle className="mr-1 inline h-3.5 w-3.5" />{form.hint}</div> : null}
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.name")} <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.unit")} <span className="text-red-500">*</span></label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">{units.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.purchasePrice")} <span className="text-red-500">*</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.sellingPrice")} <span className="text-red-500">*</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.openingStock")} <span className="text-slate-400">({t("common.optional")})</span></label>
          <input type="number" inputMode="decimal" step="any" min="0" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.lowStockThreshold")}</label>
          <input type="number" inputMode="numeric" step="1" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t("smartentry.action.cancel")}</button>
        <button type="button" onClick={() => isValid && onConfirm({ intentType: "CREATE_PRODUCT", name: name.trim(), unit: unit.trim(), purchasePrice: pp, sellingPrice: sp, openingStock: openingStock ? Number(openingStock) : 0, lowStockThreshold: parseInt(lowStockThreshold, 10) })} disabled={!isValid} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"><span className="flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> {t("smartentry.action.createProduct")}</span></button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// V13: CustomerCreationView — for CREATE_CUSTOMER intent
// ════════════════════════════════════════════════════════════════════════════

function CustomerCreationView({ form, transcript, onConfirm, onCancel }: {
  form: { name: string | null; phone: string | null; address: string | null; notes: string | null; openingBalance: number | null; hint: string | null; };
  transcript: string | null;
  onConfirm: (input: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(form.name ?? "");
  const [phone, setPhone] = useState(form.phone ?? "");
  const [openingBalance, setOpeningBalance] = useState(form.openingBalance != null ? String(form.openingBalance) : "");
  const isValid = name.trim().length > 0;

  return (
    <div className="space-y-4">
      {transcript ? <div className="rounded-xl bg-slate-50 p-3.5"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.transcript.youSaid")}</p><p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p></div> : null}
      {form.hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertCircle className="mr-1 inline h-3.5 w-3.5" />{form.hint}</div> : null}
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.name")} <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.field.phone")} <span className="text-slate-400">({t("common.optional")})</span></label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">{t("customer.openingBalance")} <span className="text-slate-400">({t("common.optional")})</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" /></div>
          <p className="mt-1 text-[11px] text-slate-500">{t("customer.openingBalanceHint")}</p></div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t("smartentry.action.cancel")}</button>
        <button type="button" onClick={() => isValid && onConfirm({ intentType: "CREATE_CUSTOMER", name: name.trim(), phone: phone.trim() || null, openingBalance: openingBalance ? Number(openingBalance) : 0 })} disabled={!isValid} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"><span className="flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> {t("smartentry.action.addCustomer")}</span></button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// V13: ClarificationView — for UNKNOWN intent
// ════════════════════════════════════════════════════════════════════════════

function ClarificationView({ clarification, transcript, onRetry, onCancel }: {
  clarification: { question: string; suggestions: string[] };
  transcript: string | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [textValue, setTextValue] = useState("");
  return (
    <div className="space-y-4">
      {transcript ? <div className="rounded-xl bg-slate-50 p-3.5"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.transcript.youSaid")}</p><p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p></div> : null}
      <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600"><AlertCircle className="h-7 w-7" /></div>
        <p className="text-sm font-medium text-slate-900">{clarification.question}</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t("smartentry.choice.examplesLabel")}</p>
        <div className="flex flex-wrap gap-1.5">
          {clarification.suggestions.map((s) => <button key={s} type="button" onClick={() => setTextValue(s)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100">{s}</button>)}
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (textValue.trim()) { onRetry(); } }} className="flex items-end gap-2">
        <textarea value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Type what happened..." rows={2} className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        <button type="submit" disabled={!textValue.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm disabled:bg-brand-300" aria-label={t("smartentry.aria.submit")}><Send className="h-5 w-5" /></button>
      </form>
      <button type="button" onClick={onCancel} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t("smartentry.action.cancel")}</button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Supplier payment (money OUT) — compact confirmation form
// ────────────────────────────────────────────────────────────────────────────

type SupplierPaymentFormShape = {
  supplierNameRaw: string | null;
  resolvedSupplierId: string | null;
  amount: number | null;
  method: string;
  notes: string | null;
  date: string;
  supplierBalance: string | null;
  supplierCandidates: Array<{ id: string; name: string; phone?: string | null }>;
};

function SupplierPaymentFormView({
  form,
  transcript,
  onConfirm,
  onCancel,
}: {
  form: SupplierPaymentFormShape;
  transcript: string | null;
  onConfirm: (input: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [supplierId, setSupplierId] = useState(form.resolvedSupplierId ?? "");
  const [amount, setAmount] = useState(form.amount != null ? String(form.amount) : "");
  const [method, setMethod] = useState(form.method || "cash");

  const selected = form.supplierCandidates.find((s) => s.id === supplierId);
  const value = Number(amount);
  const isValid = !!supplierId && Number.isFinite(value) && value > 0;

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Wallet className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("smartentry.supplierPayment.title")}</p>
          {transcript ? <p className="text-xs text-slate-500">“{transcript}”</p> : null}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.supplierPayment.supplier")}</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="">{t("smartentry.supplierPayment.pickSupplier")}</option>
          {form.supplierCandidates.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {selected && form.supplierBalance ? (
          <p className="mt-1 text-xs text-slate-500">
            {t("smartentry.supplierPayment.balance")}: Rs. {Number(form.supplierBalance).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.supplierPayment.amount")}</label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-lg font-semibold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.supplierPayment.method")}</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          {["cash", "bank", "cheque", "jazzcash", "easypaisa", "other"].map((m) => (
            <option key={m} value={m}>{t(`method.${m}` as never)}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!isValid}
          onClick={() =>
            onConfirm({
              intentType: "SUPPLIER_PAYMENT",
              supplierId,
              amount: value,
              method,
              notes: null,
            })
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"
        >
          <Check className="h-4 w-4" /> {t("smartentry.supplierPayment.confirm")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("smartentry.action.cancel")}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Reminder — compact confirmation form
// ────────────────────────────────────────────────────────────────────────────

type ReminderFormShape = {
  title: string;
  notes: string | null;
  type: string;
  priority: string;
  dueAt: string;
  customerNameRaw: string | null;
  resolvedCustomerId: string | null;
  customerCandidates: Array<{ id: string; name: string; phone?: string | null }>;
};

function toLocalDateTime(value: string): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ReminderFormView({
  form,
  transcript,
  onConfirm,
  onCancel,
}: {
  form: ReminderFormShape;
  transcript: string | null;
  onConfirm: (input: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(form.title);
  const [dueAt, setDueAt] = useState(toLocalDateTime(form.dueAt));
  const [priority, setPriority] = useState(form.priority || "normal");
  const [type, setType] = useState(form.type || "custom");
  const [customerId, setCustomerId] = useState(form.resolvedCustomerId ?? "");

  const isValid = title.trim().length > 0 && !!dueAt;

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("smartentry.reminder.title")}</p>
          {transcript ? <p className="text-xs text-slate-500">“{transcript}”</p> : null}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.reminder.what")}</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={150}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.reminder.when")}</label>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.reminder.priority")}</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {["low", "normal", "high"].map((p) => (
              <option key={p} value={p}>{t(`reminderPriority.${p}` as never)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.reminder.type")}</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          {["payment_collection", "supplier_payment", "customer_followup", "stock_reorder", "custom"].map((v) => (
            <option key={v} value={v}>{t(`reminderType.${v}` as never)}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.reminder.customer")}</label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="">{t("smartentry.reminder.noCustomer")}</option>
          {form.customerCandidates.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!isValid}
          onClick={() =>
            onConfirm({
              intentType: "CREATE_REMINDER",
              reminderTitle: title.trim(),
              reminderDueAt: new Date(dueAt).toISOString(),
              reminderPriority: priority,
              reminderType: type,
              customerId: customerId || undefined,
            })
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"
        >
          <Check className="h-4 w-4" /> {t("smartentry.reminder.confirm")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("smartentry.action.cancel")}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Purchase from a supplier — stock in + payable confirmation
// ────────────────────────────────────────────────────────────────────────────

type PurchaseFormShape = {
  supplierNameRaw: string | null;
  resolvedSupplierId: string | null;
  supplierCandidates: Array<{ id: string; name: string; phone?: string | null }>;
  productNameRaw: string | null;
  resolvedProductId: string | null;
  productCandidates: Array<{
    id: string;
    name: string;
    unit?: string | null;
    sellingPrice?: string | null;
  }>;
  quantity: number | null;
  unitCost: number | null;
  paidAmount: number;
  notes: string | null;
  date: string;
  supplierBalance: string | null;
};

function PurchaseFormView({
  form,
  transcript,
  onConfirm,
  onCancel,
}: {
  form: PurchaseFormShape;
  transcript: string | null;
  onConfirm: (input: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [supplierId, setSupplierId] = useState(form.resolvedSupplierId ?? "");
  const [productId, setProductId] = useState(form.resolvedProductId ?? "");
  const [quantity, setQuantity] = useState(form.quantity != null ? String(form.quantity) : "");
  const [unitCost, setUnitCost] = useState(form.unitCost != null ? String(form.unitCost) : "");
  const [paid, setPaid] = useState(String(form.paidAmount ?? 0));

  const product = form.productCandidates.find((p) => p.id === productId);
  const qty = Number(quantity);
  const cost = Number(unitCost);
  const paidValue = Number(paid);
  const hasNumbers = quantity.trim() !== "" && unitCost.trim() !== "";
  const total =
    hasNumbers && Number.isFinite(qty) && Number.isFinite(cost)
      ? Math.round(qty * cost * 100) / 100
      : 0;
  const credit =
    total - (Number.isFinite(paidValue) ? Math.min(paidValue, total) : 0);
  const roundedCredit = Math.round(credit * 100) / 100;

  const isValid =
    !!supplierId &&
    !!productId &&
    hasNumbers &&
    qty > 0 &&
    cost >= 0 &&
    Number.isFinite(paidValue) &&
    paidValue >= 0 &&
    paidValue <= total;

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Package className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("smartentry.purchase.title")}</p>
          {transcript ? <p className="text-xs text-slate-500">“{transcript}”</p> : null}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.purchase.supplier")}</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="">{t("smartentry.purchase.pickSupplier")}</option>
          {form.supplierCandidates.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {form.supplierBalance ? (
          <p className="mt-1 text-xs text-slate-500">
            {t("smartentry.purchase.payable")}: Rs. {Number(form.supplierBalance).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.purchase.product")}</label>
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="">{t("smartentry.purchase.pickProduct")}</option>
          {form.productCandidates.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("smartentry.purchase.quantity")}{product?.unit ? ` (${product.unit})` : ""}
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.purchase.unitCost")}</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("smartentry.purchase.paidNow")}</label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={paid}
          onChange={(e) => setPaid(e.target.value)}
          placeholder="0"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        {paidValue > total && total > 0 ? (
          <p className="mt-1 text-xs font-medium text-red-600">{t("smartentry.purchase.paidTooMuch")}</p>
        ) : null}
      </div>

      <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-600">{t("smartentry.purchase.total")}</span>
          <span className="font-semibold text-slate-900">Rs. {total.toLocaleString()}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-slate-600">{t("smartentry.purchase.onCredit")}</span>
          <span className="font-semibold text-amber-700">Rs. {roundedCredit.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!isValid}
          onClick={() =>
            onConfirm({
              intentType: "CREATE_PURCHASE",
              supplierId,
              productId,
              quantity: qty,
              unitCost: cost,
              paidAmount: Number.isFinite(paidValue) ? paidValue : 0,
              notes: null,
            })
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"
        >
          <Check className="h-4 w-4" /> {t("smartentry.purchase.confirm")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("smartentry.action.cancel")}
        </button>
      </div>
    </div>
  );
}
