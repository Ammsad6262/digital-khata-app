"use client";

/**
 * useAssistant — client state for the application-wide assistant.
 *
 * One conversation, one endpoint. Both voice and text go through the same
 * `/api/assistant/message` call, and writes go through `/api/assistant/confirm`
 * so a spoken instruction and a tapped instruction behave identically.
 */

import { useCallback, useRef, useState } from "react";
import type { AssistantReply, PlanPayload } from "@/lib/assistant/types";
import type { SpeechLanguage } from "@/lib/assistant/language";

export type AssistantState =
  | "idle"
  | "listening"
  | "transcribing"
  | "understanding"
  | "executing";

export type AssistantTurn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; reply: AssistantReply };

/** User-facing assistant health — no model names or counters. */
export type AssistantStatus = {
  ready: boolean;
  retryAt?: string;
};

let counter = 0;
function nextId() {
  counter += 1;
  return `t${Date.now().toString(36)}-${counter}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function useAssistant() {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<AssistantState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const inFlight = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/status", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: AssistantStatus };
      if (json.data) setStatus(json.data);
    } catch {
      /* status is cosmetic */
    }
  }, []);

  const append = useCallback((turn: AssistantTurn) => {
    setTurns((prev) => [...prev, turn]);
  }, []);

  const send = useCallback(
    async (input: {
      text?: string;
      audioBlob?: Blob;
      audioMimeType?: string;
      language?: SpeechLanguage;
    }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLastError(null);
      setBusy(true);

      const userLabel = input.text
        ? input.text
        : "@key:assistant.voiceMessage";
      append({ id: nextId(), role: "user", text: userLabel });

      try {
        setState(input.audioBlob ? "transcribing" : "understanding");

        const payload: Record<string, unknown> = {};
        if (input.text) payload.text = input.text;
        if (input.language) payload.language = input.language;
        if (input.audioBlob) {
          payload.audio = {
            base64: await blobToBase64(input.audioBlob),
            mimeType: input.audioMimeType || input.audioBlob.type || "audio/webm",
          };
        }

        const res = await fetch("/api/assistant/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorBody = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(errorBody?.error?.message || `Request failed (${res.status}).`);
        }

        const json = (await res.json()) as { data: AssistantReply };
        append({ id: nextId(), role: "assistant", reply: json.data });
        if (json.data.kind === "error") setLastError(json.data.text);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setLastError(message);
        append({
          id: nextId(),
          role: "assistant",
          reply: {
            kind: "error",
            code: "SERVER",
            text: message,
            preservedText: input.text ?? "",
            requestsUsed: 0,
            timings: { totalMs: 0 },
          },
        });
      } finally {
        inFlight.current = false;
        setBusy(false);
        setState("idle");
        void refreshStatus();
      }
    },
    [append, refreshStatus],
  );

  const confirm = useCallback(
    async (actionId: string, patch: Partial<PlanPayload> = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setState("executing");
      try {
        const res = await fetch("/api/assistant/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionId, patch }),
        });
        const json = (await res.json().catch(() => null)) as
          | { data?: AssistantReply; error?: { message?: string } }
          | null;

        if (!res.ok || !json?.data) {
          throw new Error(json?.error?.message || `Could not confirm (${res.status}).`);
        }
        append({ id: nextId(), role: "assistant", reply: json.data });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not confirm.";
        append({
          id: nextId(),
          role: "assistant",
          reply: {
            kind: "error",
            code: "SERVER",
            text: message,
            preservedText: "",
            requestsUsed: 0,
            timings: { totalMs: 0 },
          },
        });
      } finally {
        inFlight.current = false;
        setBusy(false);
        setState("idle");
      }
    },
    [append],
  );

  const cancel = useCallback(
    async (actionId: string) => {
      // Only tell the owner it was cancelled when the server actually cancelled
      // a still-pending action; an action that already ran keeps its result.
      let cancelled = false;
      try {
        const res = await fetch("/api/assistant/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionId }),
        });
        const json = (await res.json().catch(() => null)) as
          | { data?: { cancelled?: boolean } }
          | null;
        cancelled = json?.data?.cancelled === true;
      } catch {
        /* best-effort */
      }
      setTurns((prev) =>
        prev.map((t) =>
          t.role === "assistant" && t.reply.kind === "plan" && t.reply.actionId === actionId
            ? {
                ...t,
                reply: {
                  ...t.reply,
                  kind: "answer",
                  text: cancelled ? "@key:assistant.cancelled" : "@key:assistant.alreadyDone",
                  source: "database",
                  requestsUsed: 0,
                  timings: { totalMs: 0 },
                } as AssistantReply,
              }
            : t,
        ),
      );
    },
    [],
  );

  const reset = useCallback(() => {
    setTurns([]);
    setLastError(null);
  }, []);

  return {
    turns,
    busy,
    state,
    setState,
    lastError,
    status,
    refreshStatus,
    send,
    confirm,
    cancel,
    reset,
  };
}
