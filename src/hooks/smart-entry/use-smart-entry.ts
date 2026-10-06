"use client";

/**
 * useSmartEntry — React hook that wraps the Smart Khata Entry API.
 *
 * State machine:
 *   idle → recording → transcribing → interpreting → ready|clarification|ambiguous|failed
 *                                                                ↓
 *                                                           confirming → executing → success|error
 *
 * Exposes:
 *   - state:           the current UX state (string union)
 *   - transcript:      what the user said (for the "You said:" UI)
 *   - preview:         the resolved transaction preview (when state=ready)
 *   - candidates:      customer/product candidates (when state=ambiguous_*)
 *   - message:         user-friendly message (when state=clarification|failed)
 *   - error:           raw error message (for dev)
 *   - sessionId:       the SmartEntrySession ID (for execute/cancel)
 *   - submitText(text)         → text path
 *   - submitAudio(blob, mime)  → voice path
 *   - confirm()                → execute (no disambiguation)
 *   - chooseCustomer(id)       → execute with chosen customer
 *   - chooseProduct(id)        → execute with chosen product
 *   - cancel()                 → cancel the session
 *   - reset()                  → back to idle
 */

import { useCallback, useRef, useState } from "react";
import type {
  InterpretResult,
} from "@/lib/smart-entry/service";

export type SmartEntryState =
  | "idle"
  | "recording"
  | "transcribing"
  | "interpreting"
  | "ready"
  | "clarification"
  | "ambiguous_customer"
  | "ambiguous_product"
  | "customer_not_found"
  | "product_not_found"
  | "unsupported_intent"
  | "confirming"
  | "executing"
  | "success"
  | "cancelled"
  | "expired"
  | "error";

type ApiResult = InterpretResult;

type State = {
  state: SmartEntryState;
  sessionId: string | null;
  transcript: string | null;
  preview: ApiResult["preview"] | null;
  candidates: ApiResult["candidates"] | null;
  message: string | null;
  error: string | null;
  createdSaleId: string | null;
};

const INITIAL: State = {
  state: "idle",
  sessionId: null,
  transcript: null,
  preview: null,
  candidates: null,
  message: null,
  error: null,
  createdSaleId: null,
};

function mapStatusToState(status: ApiResult["status"]): SmartEntryState {
  switch (status) {
    case "READY": return "ready";
    case "CLARIFICATION_NEEDED": return "clarification";
    case "AMBIGUOUS_CUSTOMER": return "ambiguous_customer";
    case "AMBIGUOUS_PRODUCT": return "ambiguous_product";
    case "CUSTOMER_NOT_FOUND": return "customer_not_found";
    case "PRODUCT_NOT_FOUND": return "product_not_found";
    case "UNSUPPORTED_INTENT": return "unsupported_intent";
    case "FAILED": return "error";
    default: return "error";
  }
}

export function useSmartEntry() {
  const [state, setState] = useState<State>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const applyInterpretResult = useCallback((result: ApiResult) => {
    setState({
      state: mapStatusToState(result.status),
      sessionId: result.sessionId,
      transcript: result.transcript ?? null,
      preview: result.preview ?? null,
      candidates: result.candidates ?? null,
      message: result.message ?? null,
      error: null,
      createdSaleId: null,
    });
  }, []);

  const submitText = useCallback(async (text: string) => {
    setState({ ...INITIAL, state: "interpreting" });
    try {
      const res = await fetch("/api/smart-entry/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!json.ok) {
        setState({
          ...INITIAL,
          state: "error",
          error: json.error?.message ?? "Failed to interpret.",
          message: json.error?.message ?? "Sorry, I couldn't understand that.",
        });
        return;
      }
      applyInterpretResult(json.data as ApiResult);
    } catch (e) {
      setState({
        ...INITIAL,
        state: "error",
        error: e instanceof Error ? e.message : "Network error.",
        message: "Network error. Please check your connection.",
      });
    }
  }, [applyInterpretResult]);

  const submitAudio = useCallback(async (audio: Blob, mimeType: string) => {
    setState({ ...INITIAL, state: "transcribing" });
    try {
      // Convert Blob → base64
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
        setState({
          ...INITIAL,
          state: "error",
          error: json.error?.message ?? "Failed to transcribe.",
          message: json.error?.message ?? "Sorry, I couldn't understand that.",
        });
        return;
      }
      applyInterpretResult(json.data as ApiResult);
    } catch (e) {
      setState({
        ...INITIAL,
        state: "error",
        error: e instanceof Error ? e.message : "Network error.",
        message: "Network error. Please check your connection.",
      });
    }
  }, [applyInterpretResult]);

  const execute = useCallback(async (
    chosen?: { customerId?: string; productId?: string },
  ) => {
    if (!state.sessionId) return;
    setState((s) => ({ ...s, state: "executing" }));
    try {
      const res = await fetch("/api/smart-entry/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          chosenCustomerId: chosen?.customerId,
          chosenProductId: chosen?.productId,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setState((s) => ({
          ...s,
          state: "error",
          error: json.error?.message ?? "Failed to add to Khata.",
          message: json.error?.message ?? "Failed to add to Khata.",
        }));
        return;
      }
      setState({
        ...INITIAL,
        state: "success",
        createdSaleId: json.data.saleId,
        message: `Added to Khata — Rs. ${Number(json.data.totalAmount).toLocaleString()}`,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        state: "error",
        error: e instanceof Error ? e.message : "Network error.",
        message: "Network error. Please check your connection.",
      }));
    }
  }, [state.sessionId]);

  const cancel = useCallback(async () => {
    if (!state.sessionId) {
      setState(INITIAL);
      return;
    }
    // Fire and forget — don't block the UI on cancel
    fetch("/api/smart-entry/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId }),
    }).catch(() => {});
    setState({ ...INITIAL, state: "cancelled" });
  }, [state.sessionId]);

  const reset = useCallback(() => {
    setState(INITIAL);
  }, []);

  return {
    ...state,
    submitText,
    submitAudio,
    confirm: () => execute(),
    chooseCustomer: (id: string) => execute({ customerId: id }),
    chooseProduct: (id: string) => execute({ productId: id }),
    cancel,
    reset,
  };
}
