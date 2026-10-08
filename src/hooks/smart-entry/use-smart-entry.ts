"use client";

/**
 * useSmartEntry — React hook for Smart Khata Entry (V2: editable-form architecture).
 *
 * V2 state machine:
 *   idle → recording → transcribing → form → executing → success
 *                                  ↑           ↓
 *                                  ← error ←───┘
 *
 * The "form" state is the new normal state — AI returns partial fields,
 * the user reviews/edits in an editable form, then clicks "Add to Khata"
 * to execute.
 */

import { useCallback, useRef, useState } from "react";
import type { InterpretResult, FormFieldState } from "@/lib/smart-entry/service";

export type SmartEntryState =
  | "idle"
  | "recording"
  | "transcribing"
  | "interpreting"
  | "form"           // ← V2: the editable form (replaces ready/clarification/ambiguous_*)
  | "executing"
  | "success"
  | "cancelled"
  | "error";

type State = {
  state: SmartEntryState;
  sessionId: string | null;
  transcript: string | null;
  form: FormFieldState | null;
  message: string | null;
  error: string | null;
  createdSaleId: string | null;
};

const INITIAL: State = {
  state: "idle",
  sessionId: null,
  transcript: null,
  form: null,
  message: null,
  error: null,
  createdSaleId: null,
};

function mapStatusToState(status: InterpretResult["status"]): SmartEntryState {
  // V2: only FORM and FAILED
  if (status === "FORM") return "form";
  return "error"; // FAILED → error
}

export function useSmartEntry() {
  const [state, setState] = useState<State>(INITIAL);

  // ── Duplicate-submission guard ────────────────────────────────────────────
  // Prevents the same user action from triggering multiple Gemini requests.
  // When submitText/submitAudio is in flight, subsequent calls are ignored
  // until the first one completes. This protects against:
  //   - React re-renders causing duplicate calls
  //   - Double-click on the submit button
  //   - Any other accidental concurrent submission
  const inFlightRef = useRef(false);

  const applyInterpretResult = useCallback((result: InterpretResult) => {
    setState({
      state: mapStatusToState(result.status),
      sessionId: result.sessionId,
      transcript: result.transcript ?? null,
      form: result.form ?? null,
      message: result.message ?? null,
      error: null,
      createdSaleId: null,
    });
  }, []);

  const submitText = useCallback(async (text: string) => {
    // ── Duplicate-submission guard ──
    // If a request is already in flight, ignore this call. Prevents
    // double-click / re-render from triggering multiple Gemini requests.
    if (inFlightRef.current) {
      console.log("[smart-entry] submitText ignored — request already in flight");
      return;
    }
    inFlightRef.current = true;

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
      applyInterpretResult(json.data as InterpretResult);
    } catch (e) {
      setState({
        ...INITIAL,
        state: "error",
        error: e instanceof Error ? e.message : "Network error.",
        message: "Network error. Please check your connection.",
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [applyInterpretResult]);

  const submitAudio = useCallback(async (audio: Blob, mimeType: string) => {
    // ── Duplicate-submission guard ──
    if (inFlightRef.current) {
      console.log("[smart-entry] submitAudio ignored — request already in flight");
      return;
    }
    inFlightRef.current = true;

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
        setState({
          ...INITIAL,
          state: "error",
          error: json.error?.message ?? "Failed to transcribe.",
          message: json.error?.message ?? "Sorry, I couldn't understand that.",
        });
        return;
      }
      applyInterpretResult(json.data as InterpretResult);
    } catch (e) {
      setState({
        ...INITIAL,
        state: "error",
        error: e instanceof Error ? e.message : "Network error.",
        message: "Network error. Please check your connection.",
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [applyInterpretResult]);

  /**
   * Execute the sale with the user's final form values.
   * V3: now includes unitPrice (optional — if not provided, backend uses product default).
   * The backend re-validates everything server-side and computes amount = qty × unitPrice.
   */
  const execute = useCallback(async (input: {
    customerId: string;
    productId: string;
    quantity: number;
    unitPrice?: number;
    paidAmount?: number;
  }) => {
    if (!state.sessionId) return;
    setState((s) => ({ ...s, state: "executing" }));
    try {
      const res = await fetch("/api/smart-entry/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          customerId: input.customerId,
          productId: input.productId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          paidAmount: input.paidAmount,
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
    confirm: execute,
    cancel,
    reset,
  };
}
