"use client";

/**
 * useSmartEntry — React hook for Smart Khata Entry.
 *
 * V13 state machine:
 *   idle → recording → transcribing → interpreting → form → executing → success
 *                                                    ↑           ↓
 *                                                    ← error ←───┘
 *
 * V13 CHANGES (bug fixes):
 *   - Added AbortController to /interpret and /execute fetch calls so
 *     cancelling actually aborts the in-flight request (not just ignores
 *     the response). This prevents the server from doing wasted work and
 *     prevents stale responses from racing newer ones.
 *   - Preserves transcript + intent when transitioning to error state so
 *     the UI can show "You said: ..." even on error.
 *   - Stale-request protection via requestIdRef (V3) is preserved.
 *   - Duplicate-submission guard via inFlightRef (V3) is preserved.
 *   - Cancel properly resets the in-flight guard so the user can
 *     immediately start a new session after cancelling.
 */

import { useCallback, useRef, useState } from "react";
import type {
  InterpretResult, FormFieldState, ExpenseFormState, PaymentFormState,
  QueryResultState, StockIntakeFormState, ProductCreationFormState,
  CustomerCreationFormState, ClarificationState, SupplierPaymentFormState,
  ReminderFormState,
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
  supplierPaymentForm: SupplierPaymentFormState | null;
  reminderForm: ReminderFormState | null;
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
  supplierPaymentForm: null, reminderForm: null,
  stockIntakeForm: null, productCreationForm: null, customerCreationForm: null,
  clarification: null, message: null, error: null,
  createdSaleId: null, createdProductId: null, createdCustomerId: null,
};

function mapStatusToState(status: InterpretResult["status"]): SmartEntryState {
  if (status === "FORM") return "form";
  return "error";
}

export function useSmartEntry() {
  const [state, setState] = useState<State>(INITIAL);

  // ── Duplicate-submission guard ────────────────────────────────────────────
  const inFlightRef = useRef(false);

  // ── Stale-request protection ──────────────────────────────────────────────
  const requestIdRef = useRef(0);

  // ── AbortController for in-flight fetch ────────────────────────────────────
  // V13: Allows cancel() to actually abort the network request, not just
  // ignore the response. This prevents the server from doing wasted work
  // and prevents stale responses from racing newer ones.
  const abortControllerRef = useRef<AbortController | null>(null);

  const applyInterpretResult = useCallback((result: InterpretResult, expectedRequestId: number) => {
    if (requestIdRef.current !== expectedRequestId) {
      console.log("[smart-entry] Stale response discarded — request ID mismatch");
      return;
    }
    setState({
      state: mapStatusToState(result.status),
      sessionId: result.sessionId,
      transcript: result.transcript ?? null,
      intent: result.intent ?? null,
      form: result.form ?? null,
      expenseForm: result.expenseForm ?? null,
      paymentForm: result.paymentForm ?? null,
      supplierPaymentForm: result.supplierPaymentForm ?? null,
      reminderForm: result.reminderForm ?? null,
      queryResult: result.queryResult ?? null,
      stockIntakeForm: result.stockIntakeForm ?? null,
      productCreationForm: result.productCreationForm ?? null,
      customerCreationForm: result.customerCreationForm ?? null,
      clarification: result.clarification ?? null,
      message: result.message ?? null,
      error: null,
      createdSaleId: null,
      createdProductId: null,
      createdCustomerId: null,
    });
  }, []);

  const submitText = useCallback(async (text: string) => {
    if (inFlightRef.current) {
      console.log("[smart-entry] submitText ignored — request already in flight");
      return;
    }
    inFlightRef.current = true;

    // Abort any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const myRequestId = ++requestIdRef.current;

    // V13: Preserve transcript in the state so the UI shows "You said: ..."
    // even while interpreting and on error.
    setState({ ...INITIAL, state: "interpreting", transcript: text });
    try {
      const res = await fetch("/api/smart-entry/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!json.ok) {
        if (requestIdRef.current !== myRequestId) return;
        setState({
          ...INITIAL,
          state: "error",
          transcript: text,
          error: json.error?.message ?? "smartentry.error.interpretFailed",
          message: json.error?.message ?? "smartentry.error.couldntUnderstand",
        });
        return;
      }
      applyInterpretResult(json.data as InterpretResult, myRequestId);
    } catch (e) {
      // AbortError is expected when the user cancels — don't show an error
      if (e instanceof DOMException && e.name === "AbortError") {
        if (requestIdRef.current === myRequestId) {
          setState({ ...INITIAL, state: "cancelled" });
        }
        return;
      }
      if (requestIdRef.current !== myRequestId) return;
      setState({
        ...INITIAL,
        state: "error",
        transcript: text,
        error: e instanceof Error ? e.message : "smartentry.error.network",
        message: "smartentry.error.networkMessage",
      });
    } finally {
      if (requestIdRef.current === myRequestId) {
        inFlightRef.current = false;
        abortControllerRef.current = null;
      }
    }
  }, [applyInterpretResult]);

  const submitAudio = useCallback(async (audio: Blob, mimeType: string) => {
    if (inFlightRef.current) {
      console.log("[smart-entry] submitAudio ignored — request already in flight");
      return;
    }
    inFlightRef.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const myRequestId = ++requestIdRef.current;

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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: { base64, mimeType } }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!json.ok) {
        if (requestIdRef.current !== myRequestId) return;
        setState({
          ...INITIAL,
          state: "error",
          error: json.error?.message ?? "smartentry.error.transcribeFailed",
          message: json.error?.message ?? "smartentry.error.couldntUnderstand",
        });
        return;
      }
      applyInterpretResult(json.data as InterpretResult, myRequestId);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (requestIdRef.current === myRequestId) {
          setState({ ...INITIAL, state: "cancelled" });
        }
        return;
      }
      if (requestIdRef.current !== myRequestId) return;
      setState({
        ...INITIAL,
        state: "error",
        error: e instanceof Error ? e.message : "smartentry.error.network",
        message: "smartentry.error.networkMessage",
      });
    } finally {
      if (requestIdRef.current === myRequestId) {
        inFlightRef.current = false;
        abortControllerRef.current = null;
      }
    }
  }, [applyInterpretResult]);

  const execute = useCallback(async (input: {
    intentType?: string;
    customerId?: string;
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    paidAmount?: number;
    batchId?: string;
    expenseName?: string;
    amount?: number;
    expenseCategory?: string;
    notes?: string | null;
    date?: string;
    method?: string;
    unitCost?: number;
    batchName?: string | null;
    name?: string;
    unit?: string;
    purchasePrice?: number;
    sellingPrice?: number;
    openingStock?: number;
    lowStockThreshold?: number;
    category?: string | null;
    sku?: string | null;
    phone?: string | null;
    address?: string | null;
    openingBalance?: number;
    supplierId?: string;
    reminderTitle?: string;
    reminderDueAt?: string;
    reminderPriority?: string;
    reminderType?: string;
  }) => {
    if (!state.sessionId) return;
    // Abort any previous execute request (defensive — shouldn't happen)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((s) => ({ ...s, state: "executing" }));
    try {
      const res = await fetch("/api/smart-entry/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          intentType: input.intentType ?? "CREATE_CREDIT_SALE",
          customerId: input.customerId,
          productId: input.productId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          paidAmount: input.paidAmount,
          batchId: input.batchId,
          expenseName: input.expenseName,
          amount: input.amount,
          expenseCategory: input.expenseCategory,
          notes: input.notes,
          date: input.date,
          method: input.method,
          unitCost: input.unitCost,
          batchName: input.batchName,
          name: input.name,
          unit: input.unit,
          purchasePrice: input.purchasePrice,
          sellingPrice: input.sellingPrice,
          openingStock: input.openingStock,
          lowStockThreshold: input.lowStockThreshold,
          category: input.category,
          sku: input.sku,
          phone: input.phone,
          address: input.address,
          openingBalance: input.openingBalance,
          supplierId: input.supplierId,
          reminderTitle: input.reminderTitle,
          reminderDueAt: input.reminderDueAt,
          reminderPriority: input.reminderPriority,
          reminderType: input.reminderType,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!json.ok) {
        setState((s) => ({
          ...s,
          state: "error",
          error: json.error?.message ?? "smartentry.error.executeFailed",
          message: json.error?.message ?? "smartentry.error.executeFailed",
        }));
        return;
      }
      const data = json.data;
      setState({
        ...INITIAL,
        state: "success",
        createdSaleId: data.saleId ?? null,
        createdProductId: data.productId ?? null,
        createdCustomerId: data.customerId ?? null,
        message: data.message ?? "smartentry.success.defaultMessage",
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setState((s) => ({
        ...s,
        state: "error",
        error: e instanceof Error ? e.message : "smartentry.error.network",
        message: "smartentry.error.networkMessage",
      }));
    } finally {
      abortControllerRef.current = null;
    }
  }, [state.sessionId]);

  const cancel = useCallback(async () => {
    // Increment request ID to invalidate any in-flight API response
    requestIdRef.current++;
    inFlightRef.current = false;
    // V13: Abort any in-flight fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (!state.sessionId) {
      setState(INITIAL);
      return;
    }
    // Fire-and-forget the cancel API call — don't block the UI
    fetch("/api/smart-entry/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId }),
    }).catch(() => {});
    setState({ ...INITIAL, state: "cancelled" });
  }, [state.sessionId]);

  const reset = useCallback(() => {
    requestIdRef.current++;
    inFlightRef.current = false;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(INITIAL);
  }, []);

  return {
    ...state,
    submitText,
    submitAudio,
    confirm: execute,
    cancel,
    reset,
  };
}
