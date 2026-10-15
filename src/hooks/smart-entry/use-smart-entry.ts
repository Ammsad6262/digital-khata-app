"use client";

/**
 * useSmartEntry — React hook for Smart Khata Entry (V3: stale-request protection).
 *
 * V3 state machine:
 *   idle → recording → transcribing → form → executing → success
 *                                  ↑           ↓
 *                                  ← error ←───┘
 *
 * V3 CHANGES (bug fixes):
 *   - Added `requestIdRef` to prevent stale API responses from overwriting
 *     the current state. Each submitText/submitAudio increments the request ID.
 *     When the API response arrives, it checks if the request ID matches.
 *     If not (user cancelled + started a new session), the response is discarded.
 *   - `cancel()` now properly resets the in-flight guard so the user can
 *     immediately start a new session after cancelling.
 *   - `reset()` also clears the in-flight guard.
 *
 * The "form" state is the normal state — AI returns partial fields, the user
 * reviews/edits in an editable form, then clicks "Add to Khata" to execute.
 */

import { useCallback, useRef, useState } from "react";
import type { InterpretResult, FormFieldState, ExpenseFormState, PaymentFormState, QueryResultState, StockIntakeFormState, ProductCreationFormState, CustomerCreationFormState, ClarificationState } from "@/lib/smart-entry/service";

export type SmartEntryState =
  | "idle"
  | "recording"
  | "transcribing"
  | "interpreting"
  | "form"
  | "executing"
  | "success"
  | "cancelled"
  | "error";

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
  state: "idle",
  sessionId: null,
  transcript: null,
  intent: null,
  form: null,
  expenseForm: null,
  paymentForm: null,
  queryResult: null,
  stockIntakeForm: null,
  productCreationForm: null,
  customerCreationForm: null,
  clarification: null,
  message: null,
  error: null,
  createdSaleId: null,
  createdProductId: null,
  createdCustomerId: null,
};

function mapStatusToState(status: InterpretResult["status"]): SmartEntryState {
  if (status === "FORM") return "form";
  return "error";
}

export function useSmartEntry() {
  const [state, setState] = useState<State>(INITIAL);

  // ── Duplicate-submission guard ────────────────────────────────────────────
  // Prevents the same user action from triggering multiple API requests.
  const inFlightRef = useRef(false);

  // ── Stale-request protection ──────────────────────────────────────────────
  // Each submitText/submitAudio call gets a unique request ID. When the API
  // response arrives, we check if the request ID matches the current one.
  // If not (user cancelled + started a new session, or the component re-rendered
  // and a new request was started), the stale response is discarded.
  //
  // This prevents the bug where:
  //   1. User records audio → API starts processing
  //   2. User cancels → state resets to idle
  //   3. User starts a new text entry → API starts processing
  //   4. Old audio API response arrives → overwrites the new state with the
  //      old interpretation → UI flashes to an unexpected screen
  const requestIdRef = useRef(0);

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

    // Increment request ID for this new session
    const myRequestId = ++requestIdRef.current;

    setState({ ...INITIAL, state: "interpreting" });
    try {
      const res = await fetch("/api/smart-entry/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!json.ok) {
        // Check if this response is still current
        if (requestIdRef.current !== myRequestId) return;
        setState({
          ...INITIAL,
          state: "error",
          error: json.error?.message ?? "smartentry.error.interpretFailed",
          message: json.error?.message ?? "smartentry.error.couldntUnderstand",
        });
        return;
      }
      applyInterpretResult(json.data as InterpretResult, myRequestId);
    } catch (e) {
      if (requestIdRef.current !== myRequestId) return;
      setState({
        ...INITIAL,
        state: "error",
        error: e instanceof Error ? e.message : "smartentry.error.network",
        message: "smartentry.error.networkMessage",
      });
    } finally {
      // Only clear the in-flight guard if this request is still current.
      // If a newer request was started, the newer request's finally block
      // will clear it.
      if (requestIdRef.current === myRequestId) {
        inFlightRef.current = false;
      }
    }
  }, [applyInterpretResult]);

  const submitAudio = useCallback(async (audio: Blob, mimeType: string) => {
    if (inFlightRef.current) {
      console.log("[smart-entry] submitAudio ignored — request already in flight");
      return;
    }
    inFlightRef.current = true;

    // Increment request ID for this new session
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
    // Expense fields
    expenseName?: string;
    amount?: number;
    expenseCategory?: string;
    notes?: string | null;
    date?: string;
    method?: string;
    // Stock intake fields
    unitCost?: number;
    batchName?: string | null;
    // V13: Product creation fields
    name?: string;
    unit?: string;
    purchasePrice?: number;
    sellingPrice?: number;
    openingStock?: number;
    lowStockThreshold?: number;
    category?: string | null;
    sku?: string | null;
    // V13: Customer creation fields
    phone?: string | null;
    address?: string | null;
    openingBalance?: number;
  }) => {
    if (!state.sessionId) return;
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
        }),
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
      // V10: Handle different result types
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
      setState((s) => ({
        ...s,
        state: "error",
        error: e instanceof Error ? e.message : "smartentry.error.network",
        message: "smartentry.error.networkMessage",
      }));
    }
  }, [state.sessionId]);

  const cancel = useCallback(async () => {
    // Increment request ID to invalidate any in-flight API response
    requestIdRef.current++;
    // Clear in-flight guard so the user can start a new session immediately
    inFlightRef.current = false;

    if (!state.sessionId) {
      setState(INITIAL);
      return;
    }
    fetch("/api/smart-entry/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId }),
    }).catch(() => {});
    setState({ ...INITIAL, state: "cancelled" });
  }, [state.sessionId]);

  const reset = useCallback(() => {
    // Increment request ID to invalidate any in-flight API response
    requestIdRef.current++;
    // Clear in-flight guard
    inFlightRef.current = false;
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
