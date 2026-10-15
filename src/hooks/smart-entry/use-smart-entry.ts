"use client";

/**
 * useSmartEntry — React hook for Smart Entry state machine.
 *
 * States: idle → recording → transcribing → interpreting → form → executing → success
 *
 * Features:
 *   - AbortController for cancellable fetch
 *   - Stale-request protection (requestIdRef)
 *   - Duplicate-submission guard (inFlightRef)
 *   - Preserves transcript on error
 */

import { useCallback, useRef, useState } from "react";
import type {
  InterpretResult, FormFieldState, ExpenseFormState, PaymentFormState,
  QueryResultState, StockIntakeFormState, ProductCreationFormState,
  CustomerCreationFormState, ClarificationState,
} from "@/lib/smart-entry/service";

export type SmartEntryState =
  | "idle" | "recording" | "transcribing" | "interpreting"
  | "form" | "executing" | "success" | "cancelled" | "error";

type State = {
  state: SmartEntryState;
  sessionId: string | null;
  transcript: string | null;
  intent: string | null;
  form: FormFieldState | null;
  expenseForm: ExpenseFormState | null;
  paymentForm: PaymentFormState | null;
  queryResult: QueryResultState | null;
  stockIntakeForm: StockIntakeFormState | null;
  productCreationForm: ProductCreationFormState | null;
  customerCreationForm: CustomerCreationFormState | null;
  clarification: ClarificationState | null;
  message: string | null;
  error: string | null;
  createdSaleId: string | null;
  createdProductId: string | null;
  createdCustomerId: string | null;
};

const INITIAL: State = {
  state: "idle", sessionId: null, transcript: null, intent: null,
  form: null, expenseForm: null, paymentForm: null, queryResult: null,
  stockIntakeForm: null, productCreationForm: null, customerCreationForm: null,
  clarification: null, message: null, error: null,
  createdSaleId: null, createdProductId: null, createdCustomerId: null,
};

export function useSmartEntry() {
  const [state, setState] = useState<State>(INITIAL);
  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const applyResult = useCallback((result: InterpretResult, expectedId: number) => {
    if (requestIdRef.current !== expectedId) return;
    setState({
      state: result.status === "FORM" ? "form" : "error",
      sessionId: result.sessionId,
      transcript: result.transcript ?? null,
      intent: result.intent ?? null,
      form: result.form ?? null,
      expenseForm: result.expenseForm ?? null,
      paymentForm: result.paymentForm ?? null,
      queryResult: result.queryResult ?? null,
      stockIntakeForm: result.stockIntakeForm ?? null,
      productCreationForm: result.productCreationForm ?? null,
      customerCreationForm: result.customerCreationForm ?? null,
      clarification: result.clarification ?? null,
      message: result.message ?? null,
      error: null,
      createdSaleId: null, createdProductId: null, createdCustomerId: null,
    });
  }, []);

  const submitText = useCallback(async (text: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const myId = ++requestIdRef.current;

    setState({ ...INITIAL, state: "interpreting", transcript: text });
    try {
      const res = await fetch("/api/smart-entry/interpret", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }), signal: controller.signal,
      });
      const json = await res.json();
      if (!json.ok) {
        if (requestIdRef.current !== myId) return;
        setState({ ...INITIAL, state: "error", transcript: text, error: json.error?.message ?? "Interpretation failed.", message: json.error?.message });
        return;
      }
      applyResult(json.data as InterpretResult, myId);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (requestIdRef.current === myId) setState({ ...INITIAL, state: "cancelled" });
        return;
      }
      if (requestIdRef.current !== myId) return;
      setState({ ...INITIAL, state: "error", transcript: text, error: "Network error.", message: "Network error." });
    } finally {
      if (requestIdRef.current === myId) { inFlightRef.current = false; abortControllerRef.current = null; }
    }
  }, [applyResult]);

  const submitAudio = useCallback(async (audio: Blob, mimeType: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const myId = ++requestIdRef.current;

    setState({ ...INITIAL, state: "transcribing" });
    try {
      const arrayBuffer = await audio.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk) as number[]);
      }
      const base64 = btoa(binary);
      const res = await fetch("/api/smart-entry/interpret", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: { base64, mimeType } }), signal: controller.signal,
      });
      const json = await res.json();
      if (!json.ok) {
        if (requestIdRef.current !== myId) return;
        setState({ ...INITIAL, state: "error", error: json.error?.message ?? "Transcription failed.", message: json.error?.message });
        return;
      }
      applyResult(json.data as InterpretResult, myId);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (requestIdRef.current === myId) setState({ ...INITIAL, state: "cancelled" });
        return;
      }
      if (requestIdRef.current !== myId) return;
      setState({ ...INITIAL, state: "error", error: "Network error.", message: "Network error." });
    } finally {
      if (requestIdRef.current === myId) { inFlightRef.current = false; abortControllerRef.current = null; }
    }
  }, [applyResult]);

  const execute = useCallback(async (input: Record<string, unknown>) => {
    if (!state.sessionId) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((s) => ({ ...s, state: "executing" }));
    try {
      const res = await fetch("/api/smart-entry/execute", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, ...input }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!json.ok) {
        setState((s) => ({ ...s, state: "error", error: json.error?.message ?? "Execution failed.", message: json.error?.message }));
        return;
      }
      const data = json.data;
      setState({
        ...INITIAL, state: "success",
        createdSaleId: data.saleId ?? null,
        createdProductId: data.productId ?? null,
        createdCustomerId: data.customerId ?? null,
        message: data.message ?? "Done",
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setState((s) => ({ ...s, state: "error", error: "Network error.", message: "Network error." }));
    } finally {
      abortControllerRef.current = null;
    }
  }, [state.sessionId]);

  const cancel = useCallback(async () => {
    requestIdRef.current++;
    inFlightRef.current = false;
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    if (!state.sessionId) { setState(INITIAL); return; }
    fetch("/api/smart-entry/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: state.sessionId }) }).catch(() => {});
    setState({ ...INITIAL, state: "cancelled" });
  }, [state.sessionId]);

  const reset = useCallback(() => {
    requestIdRef.current++;
    inFlightRef.current = false;
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    setState(INITIAL);
  }, []);

  return { ...state, submitText, submitAudio, confirm: execute, cancel, reset };
}
