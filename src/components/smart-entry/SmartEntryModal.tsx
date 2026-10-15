"use client";

/**
 * SmartEntryModal — the full Smart Khata Entry UI.
 *
 * Renders the correct form based on detected intent:
 *   - CREATE_CREDIT_SALE → EditableFormView (sale form)
 *   - CREATE_EXPENSE → ExpenseFormView
 *   - RECORD_PAYMENT → PaymentFormView (with outstanding balance)
 *   - CREATE_PRODUCT → ProductCreationView
 *   - CREATE_CUSTOMER → CustomerCreationView
 *   - STOCK_INTAKE → StockIntakeFormView
 *   - QUERY → QueryResultView
 *   - UNKNOWN → ClarificationView
 *
 * Rendered via Portal to document.body.
 */

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Send, Loader2, Check, AlertCircle, Sparkles, Mic } from "lucide-react";
import { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";
import { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";

export function SmartEntryModal({
  open, onClose, smartEntry, recorder,
}: {
  open: boolean;
  onClose: () => void;
  smartEntry: ReturnType<typeof useSmartEntry>;
  recorder: ReturnType<typeof useAudioRecorder>;
}) {
  const [mounted, setMounted] = useState(false);
  const [textValue, setTextValue] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = useCallback(() => {
    if (smartEntry.state === "executing") return;
    const terminal = ["success", "cancelled", "expired", "error"];
    if (smartEntry.sessionId && !terminal.includes(smartEntry.state)) smartEntry.cancel();
    smartEntry.reset();
    setTextValue("");
    if (recorder.state === "recording" || recorder.state === "requesting") recorder.cancel();
    onClose();
  }, [smartEntry, recorder, onClose]);

  const handleTextSubmit = useCallback(async () => {
    const text = textValue.trim();
    if (!text) return;
    await smartEntry.submitText(text);
  }, [textValue, smartEntry]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-[2px]" onClick={handleClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Smart Khata Entry"
        className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:inset-y-8 sm:bottom-auto sm:rounded-2xl"
        style={{ maxHeight: "90dvh", animation: "se-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
        <div className="flex shrink-0 justify-center pt-2 sm:hidden"><div className="h-1 w-10 rounded-full bg-slate-300" aria-hidden /></div>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm"><Sparkles className="h-5 w-5" /></div>
            <div><h2 className="text-base font-bold text-slate-900">Smart Entry</h2><p className="text-[11px] text-slate-500">Speak or type what happened</p></div>
          </div>
          <button type="button" onClick={handleClose} disabled={smartEntry.state === "executing"} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <SmartEntryBody smartEntry={smartEntry} recorder={recorder} textValue={textValue} setTextValue={setTextValue} onTextSubmit={handleTextSubmit} />
        </div>
        <style>{`@keyframes se-slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      </div>
    </>,
    document.body,
  );
}

// ── Body — switches based on state ───────────────────────────────────────────

function SmartEntryBody({ smartEntry, recorder, textValue, setTextValue, onTextSubmit }: {
  smartEntry: ReturnType<typeof useSmartEntry>;
  recorder: ReturnType<typeof useAudioRecorder>;
  textValue: string; setTextValue: (v: string) => void; onTextSubmit: () => void;
}) {
  const { state } = smartEntry;

  if (state === "transcribing" || state === "interpreting") {
    return <LoadingState title={state === "transcribing" ? "Listening..." : "Understanding..."} subtitle={state === "transcribing" ? "Converting your voice to text" : "Figuring out what you meant"} />;
  }
  if (state === "executing") return <LoadingState title="Adding to Khata..." subtitle="Creating the transaction" />;

  // Intent-specific forms
  if (state === "form" && smartEntry.expenseForm) return <ExpenseFormView form={smartEntry.expenseForm} transcript={smartEntry.transcript} onConfirm={smartEntry.confirm} onCancel={smartEntry.cancel} />;
  if (state === "form" && smartEntry.paymentForm) return <PaymentFormView form={smartEntry.paymentForm} transcript={smartEntry.transcript} onConfirm={smartEntry.confirm} onCancel={smartEntry.cancel} />;
  if (state === "form" && smartEntry.queryResult) return <QueryResultView result={smartEntry.queryResult} transcript={smartEntry.transcript} onDone={smartEntry.reset} />;
  if (state === "form" && smartEntry.stockIntakeForm) return <StockIntakeFormView form={smartEntry.stockIntakeForm} transcript={smartEntry.transcript} onConfirm={smartEntry.confirm} onCancel={smartEntry.cancel} />;
  if (state === "form" && smartEntry.productCreationForm) return <ProductCreationView form={smartEntry.productCreationForm} transcript={smartEntry.transcript} onConfirm={smartEntry.confirm} onCancel={smartEntry.cancel} />;
  if (state === "form" && smartEntry.customerCreationForm) return <CustomerCreationView form={smartEntry.customerCreationForm} transcript={smartEntry.transcript} onConfirm={smartEntry.confirm} onCancel={smartEntry.cancel} />;
  if (state === "form" && smartEntry.clarification) return <ClarificationView clarification={smartEntry.clarification} transcript={smartEntry.transcript} onRetry={smartEntry.reset} onCancel={smartEntry.cancel} />;
  if (state === "form" && smartEntry.form) return <EditableFormView form={smartEntry.form} transcript={smartEntry.transcript} onConfirm={smartEntry.confirm} onCancel={smartEntry.cancel} />;

  if (state === "success") return <SuccessState message={smartEntry.message ?? "Added to Khata"} saleId={smartEntry.createdSaleId} productId={smartEntry.createdProductId} customerId={smartEntry.createdCustomerId} onDone={smartEntry.reset} />;
  if (state === "cancelled") return <MessageState title="Cancelled" message="The entry was not added to your Khata." onRetry={() => smartEntry.reset()} />;
  if (state === "error") return <MessageState title="Something went wrong" message={smartEntry.error ?? smartEntry.message ?? "Please try again."} onRetry={() => smartEntry.reset()} />;

  // Recorder states
  if (recorder.state === "requesting") return <LoadingState title="Requesting microphone..." subtitle="Allow microphone access to speak" />;
  if (recorder.state === "recording" || recorder.state === "stopping") return <RecordingState levels={recorder.levels} onStop={() => recorder.stop()} onCancel={() => { recorder.cancel(); smartEntry.reset(); }} />;
  if (recorder.state === "denied" || recorder.state === "unsupported" || recorder.state === "error") return <MicErrorState state={recorder.state} message={recorder.error ?? "Microphone error"} onRetry={() => { recorder.reset(); smartEntry.reset(); }} onUseText={() => { recorder.reset(); smartEntry.reset(); }} />;

  // Default: ChoiceView
  return <ChoiceView textValue={textValue} setTextValue={setTextValue} onTextSubmit={onTextSubmit} />;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function LoadingState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
      <div><p className="text-base font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>
    </div>
  );
}

function MessageState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600"><AlertCircle className="h-7 w-7" /></div>
      <div><p className="text-base font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-600">{message}</p></div>
      <button type="button" onClick={onRetry} className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Try again</button>
    </div>
  );
}

function ChoiceView({ textValue, setTextValue, onTextSubmit }: { textValue: string; setTextValue: (v: string) => void; onTextSubmit: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
        <p className="mb-1.5 font-medium text-slate-700">Try saying or typing:</p>
        <ul className="space-y-1">
          <li>&ldquo;Ahmad bought 25 kg rice&rdquo;</li>
          <li>&ldquo;Add a product called cooking oil&rdquo;</li>
          <li>&ldquo;Ahmad paid back Rs. 20,000&rdquo;</li>
          <li>&ldquo;I spent 200 on tea&rdquo;</li>
        </ul>
      </div>
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5 text-xs text-brand-800">
        <p className="flex items-center gap-1.5"><Mic className="h-4 w-4 shrink-0" /><span>Hold the mic button on the Dashboard to speak, or type below.</span></p>
      </div>
      <div className="flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-xs text-slate-400">OR TYPE</span><div className="h-px flex-1 bg-slate-200" /></div>
      <form onSubmit={(e) => { e.preventDefault(); onTextSubmit(); }} className="flex items-end gap-2">
        <textarea value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Type what happened..." rows={2} autoFocus
          className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        <button type="submit" disabled={!textValue.trim()} aria-label="Submit"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm transition-colors hover:bg-brand-700 active:scale-95 disabled:bg-brand-300">
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}

function RecordingState({ levels, onStop, onCancel }: { levels: number; onStop: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute rounded-full bg-red-500/20" style={{ width: 80 + Math.min(40, levels * 80), height: 80 + Math.min(40, levels * 80), transition: "width 0.1s, height 0.1s" }} />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg"><Mic className="h-8 w-8" /></div>
      </div>
      <p className="text-sm font-medium text-slate-700">Recording... Tap stop when done</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={onStop} className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700">Stop & Send</button>
      </div>
    </div>
  );
}

function MicErrorState({ state, message, onRetry, onUseText }: { state: string; message: string; onRetry: () => void; onUseText: () => void }) {
  const title = state === "denied" ? "Microphone permission denied" : state === "unsupported" ? "Microphone not supported" : "Microphone unavailable";
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600"><AlertCircle className="h-7 w-7" /></div>
      <div><p className="text-base font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-600">{message}</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={onRetry} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Try again</button>
        <button type="button" onClick={onUseText} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Type instead</button>
      </div>
    </div>
  );
}

function SuccessState({ message, saleId, productId, customerId, onDone }: { message: string; saleId: string | null; productId: string | null; customerId: string | null; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-8 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute rounded-full bg-green-500/20" style={{ width: 80, height: 80, animation: "se-pulse-ring 1.2s ease-in-out infinite" }} />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/40"><Check className="h-8 w-8" strokeWidth={3} /></div>
      </div>
      <div><p className="text-lg font-bold text-slate-900">Added to Khata</p><p className="mt-1 text-sm text-slate-600">{message}</p></div>
      <div className="flex w-full gap-2">
        {saleId ? <Link href={`/sales/${saleId}`} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">View Sale</Link> : null}
        {productId ? <Link href={`/more/products/${productId}`} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">View Product</Link> : null}
        {customerId ? <Link href={`/khata/${customerId}`} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">View Khata</Link> : null}
        <button type="button" onClick={onDone} className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Done</button>
      </div>
      <style>{`@keyframes se-pulse-ring{0%{transform:scale(0.9);opacity:.7}50%{transform:scale(1.2);opacity:.2}100%{transform:scale(0.9);opacity:.7}}`}</style>
    </div>
  );
}

// ── Intent-specific form views ──────────────────────────────────────────────
// (These are simplified forms that call the execute API with the right fields)

function TranscriptDisplay({ transcript }: { transcript: string | null }) {
  if (!transcript) return null;
  return <div className="rounded-xl bg-slate-50 p-3.5"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">You said</p><p className="mt-1 text-sm italic text-slate-700">&ldquo;{transcript}&rdquo;</p></div>;
}

function ExpenseFormView({ form, transcript, onConfirm, onCancel }: { form: any; transcript: string | null; onConfirm: (input: any) => void; onCancel: () => void }) {
  const [name, setName] = useState(form.expenseName ?? "");
  const [amount, setAmount] = useState(form.amount != null ? String(form.amount) : "");
  const [category, setCategory] = useState(form.category ?? "other");
  const [notes, setNotes] = useState(form.notes ?? "");
  const [date, setDate] = useState(form.date ? new Date(form.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amountNum = Number(amount);
  const canSubmit = name.trim() && Number.isFinite(amountNum) && amountNum > 0;

  const CATEGORIES = [
    { value: "shop", label: "Shop" }, { value: "transport", label: "Transport" }, { value: "electricity", label: "Electricity" },
    { value: "packaging", label: "Packaging" }, { value: "salary", label: "Salary" }, { value: "rent", label: "Rent" }, { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-4">
      <TranscriptDisplay transcript={transcript} />
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Expense Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tea, Electricity bill" autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Amount <span className="text-red-500">*</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORIES.map((c) => <button key={c.value} type="button" onClick={() => setCategory(c.value)} className={cn("rounded-lg border py-2 text-xs font-medium", category === c.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600")}>{c.label}</button>)}
          </div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional details..." rows={2} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => canSubmit && onConfirm({ intentType: "CREATE_EXPENSE", expenseName: name.trim(), amount: amountNum, expenseCategory: category, notes: notes.trim() || null, date: new Date(date).toISOString() })} disabled={!canSubmit} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"><span className="flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Save Expense</span></button>
      </div>
    </div>
  );
}

function PaymentFormView({ form, transcript, onConfirm, onCancel }: { form: any; transcript: string | null; onConfirm: (input: any) => void; onCancel: () => void }) {
  const [customerId, setCustomerId] = useState(form.resolvedCustomerId ?? "");
  const [amountStr, setAmountStr] = useState(form.amount != null ? String(form.amount) : "");
  const [method, setMethod] = useState(form.method ?? "cash");
  const [date, setDate] = useState(form.date ? new Date(form.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amountNum = Number(amountStr);
  const canSubmit = !!customerId && Number.isFinite(amountNum) && amountNum > 0;
  const currentBalance = form.customerBalance ? Number(form.customerBalance) : null;
  const remainingBalance = currentBalance != null && amountNum > 0 ? currentBalance - amountNum : currentBalance;
  const METHODS = [{ value: "cash", label: "Cash" }, { value: "bank", label: "Bank" }, { value: "cheque", label: "Cheque" }, { value: "jazzcash", label: "JazzCash" }, { value: "easypaisa", label: "EasyPaisa" }, { value: "other", label: "Other" }];

  return (
    <div className="space-y-4">
      <TranscriptDisplay transcript={transcript} />
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Customer <span className="text-red-500">*</span></label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
            <option value="">— Select customer —</option>
            {form.customerCandidates?.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
          </select></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Amount Received <span className="text-red-500">*</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0" autoFocus className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-lg font-bold tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
        {currentBalance != null ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding Balance</span>
              <span className={cn("text-lg font-bold tabular-nums", currentBalance > 0 ? "text-amber-700" : currentBalance < 0 ? "text-blue-700" : "text-green-700")}>
                {currentBalance > 0 ? `Rs. ${currentBalance.toLocaleString()} (owes you)` : currentBalance < 0 ? `Rs. ${Math.abs(currentBalance).toLocaleString()} (advance)` : "Settled"}
              </span></div>
            {amountNum > 0 && remainingBalance != null ? (
              <><div className="border-t-2 border-dashed border-slate-100" /><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">After This Payment</span>
                {remainingBalance > 0 ? <span className="text-lg font-bold tabular-nums text-amber-700">Rs. {remainingBalance.toLocaleString()} remaining</span> : remainingBalance < 0 ? <span className="text-lg font-bold tabular-nums text-blue-700">Rs. {Math.abs(remainingBalance).toLocaleString()} advance</span> : <span className="text-lg font-bold tabular-nums text-green-700">Fully settled</span>}</div></>
            ) : null}
            {currentBalance > 0 && amountNum > currentBalance ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ This payment exceeds the outstanding balance. Excess will be advance credit.</div> : null}
          </div>) : null}
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Payment Method</label>
          <div className="grid grid-cols-3 gap-1.5">{METHODS.map((m) => <button key={m.value} type="button" onClick={() => setMethod(m.value)} className={cn("rounded-lg border py-2 text-xs font-medium", method === m.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600")}>{m.label}</button>)}</div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => canSubmit && onConfirm({ intentType: "RECORD_PAYMENT", customerId, amount: amountNum, method, date: new Date(date).toISOString() })} disabled={!canSubmit} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"><span className="flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Save Payment</span></button>
      </div>
    </div>
  );
}

function QueryResultView({ result, transcript, onDone }: { result: any; transcript: string | null; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <TranscriptDisplay transcript={transcript} />
      <div className="rounded-xl bg-brand-50 border border-brand-200 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">Result</p>
        <p className="mt-1 text-sm font-medium text-slate-900">{result.result}</p>
      </div>
      <button type="button" onClick={onDone} className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">Done</button>
    </div>
  );
}

function StockIntakeFormView({ form, transcript, onConfirm, onCancel }: { form: any; transcript: string | null; onConfirm: (input: any) => void; onCancel: () => void }) {
  const [productId, setProductId] = useState(form.resolvedProductId ?? "");
  const [quantity, setQuantity] = useState(form.quantity != null ? String(form.quantity) : "");
  const [unitCost, setUnitCost] = useState(form.unitCost != null ? String(form.unitCost) : "");
  const [batchName, setBatchName] = useState(form.batchName ?? "");
  const [date, setDate] = useState(form.date ? new Date(form.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const qtyNum = Number(quantity);
  const costNum = Number(unitCost);
  const canSubmit = !!productId && Number.isFinite(qtyNum) && qtyNum > 0 && Number.isFinite(costNum) && costNum >= 0;

  return (
    <div className="space-y-4">
      <TranscriptDisplay transcript={transcript} />
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Product <span className="text-red-500">*</span></label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
            <option value="">— Select product —</option>
            {form.productCandidates?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Quantity <span className="text-red-500">*</span></label>
          <input type="number" inputMode="decimal" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Unit Cost <span className="text-red-500">*</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Batch Name (optional)</label>
          <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. October Rice" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
      </div>
      {qtyNum > 0 && costNum > 0 ? <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Total cost: <strong>Rs. {(qtyNum * costNum).toLocaleString()}</strong></div> : null}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => canSubmit && onConfirm({ intentType: "STOCK_INTAKE", productId, quantity: qtyNum, unitCost: costNum, batchName: batchName.trim() || null, date: new Date(date).toISOString() })} disabled={!canSubmit} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"><span className="flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Add Stock</span></button>
      </div>
    </div>
  );
}

function ProductCreationView({ form, transcript, onConfirm, onCancel }: { form: any; transcript: string | null; onConfirm: (input: any) => void; onCancel: () => void }) {
  const [name, setName] = useState(form.name ?? "");
  const [unit, setUnit] = useState(form.unit ?? "kg");
  const [purchasePrice, setPurchasePrice] = useState(form.purchasePrice != null ? String(form.purchasePrice) : "");
  const [sellingPrice, setSellingPrice] = useState(form.sellingPrice != null ? String(form.sellingPrice) : "");
  const [openingStock, setOpeningStock] = useState(form.openingStock != null ? String(form.openingStock) : "");
  const [lowStockThreshold, setLowStockThreshold] = useState(String(form.lowStockThreshold ?? 5));
  const pp = Number(purchasePrice); const sp = Number(sellingPrice);
  const isValid = name.trim() && unit.trim() && Number.isFinite(pp) && pp >= 0 && Number.isFinite(sp) && sp >= 0;
  const UNITS = ["kg", "piece", "box", "dozen", "litre", "metre", "pack", "bag", "bottle", "carton"];

  return (
    <div className="space-y-4">
      <TranscriptDisplay transcript={transcript} />
      {form.hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertCircle className="mr-1 inline h-3.5 w-3.5" />{form.hint}</div> : null}
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Product Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cooking Oil" autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Unit <span className="text-red-500">*</span></label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Purchase Price <span className="text-red-500">*</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Selling Price <span className="text-red-500">*</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Opening Stock (optional)</label>
          <input type="number" inputMode="decimal" step="any" min="0" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Low-Stock Threshold</label>
          <input type="number" inputMode="numeric" step="1" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => isValid && onConfirm({ intentType: "CREATE_PRODUCT", name: name.trim(), unit: unit.trim(), purchasePrice: pp, sellingPrice: sp, openingStock: openingStock ? Number(openingStock) : 0, lowStockThreshold: parseInt(lowStockThreshold, 10) })} disabled={!isValid} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"><span className="flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Create Product</span></button>
      </div>
    </div>
  );
}

function CustomerCreationView({ form, transcript, onConfirm, onCancel }: { form: any; transcript: string | null; onConfirm: (input: any) => void; onCancel: () => void }) {
  const [name, setName] = useState(form.name ?? "");
  const [phone, setPhone] = useState(form.phone ?? "");
  const [openingBalance, setOpeningBalance] = useState(form.openingBalance != null ? String(form.openingBalance) : "");
  const isValid = name.trim().length > 0;

  return (
    <div className="space-y-4">
      <TranscriptDisplay transcript={transcript} />
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Phone (optional)</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Opening Balance (optional)</label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" /></div>
          <p className="mt-1 text-[11px] text-slate-500">Set when migrating from paper khata. Leave 0 for new customers.</p></div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => isValid && onConfirm({ intentType: "CREATE_CUSTOMER", name: name.trim(), phone: phone.trim() || null, openingBalance: openingBalance ? Number(openingBalance) : 0 })} disabled={!isValid} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"><span className="flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Add Customer</span></button>
      </div>
    </div>
  );
}

function ClarificationView({ clarification, transcript, onRetry, onCancel }: { clarification: any; transcript: string | null; onRetry: () => void; onCancel: () => void }) {
  const [textValue, setTextValue] = useState("");
  return (
    <div className="space-y-4">
      <TranscriptDisplay transcript={transcript} />
      <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600"><AlertCircle className="h-7 w-7" /></div>
        <p className="text-sm font-medium text-slate-900">{clarification.question}</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Try saying or typing:</p>
        <div className="flex flex-wrap gap-1.5">
          {clarification.suggestions.map((s: string) => <button key={s} type="button" onClick={() => setTextValue(s)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100">{s}</button>)}
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (textValue.trim()) { onRetry(); } }} className="flex items-end gap-2">
        <textarea value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Type what happened..." rows={2} className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        <button type="submit" disabled={!textValue.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm disabled:bg-brand-300" aria-label="Submit"><Send className="h-5 w-5" /></button>
      </form>
      <button type="button" onClick={onCancel} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
    </div>
  );
}

// ── EditableFormView (sale form) — simplified for now ───────────────────────

function EditableFormView({ form, transcript, onConfirm, onCancel }: { form: any; transcript: string | null; onConfirm: (input: any) => void; onCancel: () => void }) {
  const [customerId, setCustomerId] = useState(form.resolvedCustomerId ?? "");
  const [productId, setProductId] = useState(form.resolvedProductId ?? "");
  const [quantity, setQuantity] = useState(form.quantityRaw != null ? String(form.quantityRaw) : "");
  const [unitPrice, setUnitPrice] = useState(form.unitPrice != null ? String(form.unitPrice) : "");
  const [paidAmount, setPaidAmount] = useState(form.paidAmount != null ? String(form.paidAmount) : "");
  const qtyNum = Number(quantity);
  const priceNum = Number(unitPrice);
  const paidNum = Number(paidAmount);
  const total = Number.isFinite(qtyNum) && Number.isFinite(priceNum) ? qtyNum * priceNum : 0;
  const canSubmit = !!customerId && !!productId && Number.isFinite(qtyNum) && qtyNum > 0 && Number.isFinite(priceNum) && priceNum > 0;

  return (
    <div className="space-y-4">
      <TranscriptDisplay transcript={transcript} />
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Customer <span className="text-red-500">*</span></label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
            <option value="">— Select customer —</option>
            {form.customerCandidates?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Product <span className="text-red-500">*</span></label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
            <option value="">— Select product —</option>
            {form.productCandidates?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Quantity <span className="text-red-500">*</span></label>
          <input type="number" inputMode="decimal" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Unit Price <span className="text-red-500">*</span></label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
        <div><label className="mb-1 block text-xs font-medium text-slate-600">Amount Paid</label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Rs.</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" /></div></div>
      </div>
      {total > 0 ? <div className="rounded-xl bg-slate-50 p-3 flex items-center justify-between"><span className="text-xs font-medium text-slate-500">Total</span><span className="text-lg font-bold tabular-nums text-slate-900">{formatMoney(total)}</span></div> : null}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => canSubmit && onConfirm({ intentType: "CREATE_CREDIT_SALE", customerId, productId, quantity: qtyNum, unitPrice: priceNum, paidAmount: paidNum || 0 })} disabled={!canSubmit} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:bg-brand-300"><span className="flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Add to Khata</span></button>
      </div>
    </div>
  );
}
