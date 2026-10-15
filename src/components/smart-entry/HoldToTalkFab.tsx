"use client";

/**
 * HoldToTalkFab — the Dashboard floating action button with hold-to-record.
 *
 * V9: Restores the Dashboard FAB as the PRIMARY hold-to-talk control.
 * The user holds THIS button (on the Dashboard) to start recording — they
 * don't need to open the Smart Entry modal first.
 *
 * Interaction:
 *   - HOLD (press + hold > 300ms) → start recording
 *   - RELEASE (unlocked) → stop recording → submitAudio → modal opens with form
 *   - SWIPE UP while holding → lock recording (release doesn't stop)
 *   - LOCKED → tap Stop button to finish
 *   - SHORT TAP (< 300ms) → open Smart Entry modal for text entry
 *
 * Architecture:
 *   - Uses the SHARED useAudioRecorder (passed as prop from providers.tsx)
 *   - Uses the SHARED useSmartEntry (passed as prop)
 *   - NO onClick handler — only pointer events (prevents synthetic click bugs)
 *   - Pointer capture ensures pointerup fires even if finger leaves the button
 *   - touch-action: none prevents scrolling during hold
 *
 * The recording pill (timer + status) appears above the FAB when recording.
 * When recording stops, the audio is submitted to the API and the modal
 * opens automatically to show the transcription → form flow.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { Mic, Lock, X, Send, Loader2, Sparkles, ArrowUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import type { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";
import type { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";

const HOLD_THRESHOLD_MS = 300;
const LOCK_THRESHOLD_PX = 60;
const MAX_RECORDING_MS = 30_000;

type GestureState = "idle" | "holding" | "recording" | "locked" | "cancel_pending";

export function HoldToTalkFab({
  recorder,
  smartEntry,
  onModalOpen,
}: {
  recorder: ReturnType<typeof useAudioRecorder>;
  smartEntry: ReturnType<typeof useSmartEntry>;
  onModalOpen: () => void;
}) {
  const { t } = useLanguage();
  const [gestureState, setGestureState] = useState<GestureState>("idle");
  const [duration, setDuration] = useState(0);

  // Refs
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const hasStartedRecordingRef = useRef(false);
  const hasSubmittedRef = useRef(false);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    };
  }, []);

  // ── Reset gesture when recorder returns to idle ──────────────────────────
  useEffect(() => {
    if (recorder.state === "idle" && gestureState !== "idle") {
      setGestureState("idle");
      setDuration(0);
      hasStartedRecordingRef.current = false;
      hasSubmittedRef.current = false;
    }
  }, [recorder.state, gestureState]);

  // ── Watch smartEntry state — when it leaves transcribing/interpreting,
  //    open the modal so the user sees the form/result.
  useEffect(() => {
    if (smartEntry.state === "form" || smartEntry.state === "error" || smartEntry.state === "success") {
      onModalOpen();
    }
  }, [smartEntry.state, onModalOpen]);

  // ── Format timer ──────────────────────────────────────────────────────────
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Start duration timer ─────────────────────────────────────────────────
  const startDurationTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setDuration(0);
    durationTimerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  // ── Stop duration timer ──────────────────────────────────────────────────
  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  // ── Actually start recording (called after hold threshold) ────────────────
  const doStartRecording = useCallback(async () => {
    hasStartedRecordingRef.current = true;
    hasSubmittedRef.current = false;
    setGestureState("recording");
    startDurationTimer();

    // Start the recorder with a callback that submits audio when recording stops
    await recorder.start(async (blob, mimeType) => {
      // This callback fires when recording stops (onstop)
      // Guard against duplicate submission
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;
      // Submit to the API → smartEntry.state becomes "transcribing"
      await smartEntry.submitAudio(blob, mimeType);
      // The useEffect watching smartEntry.state will open the modal
    });

    // Hard cap at 30 seconds
    maxTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, MAX_RECORDING_MS);
  }, [recorder, smartEntry, startDurationTimer]);

  // ── Stop recording (unlocked release or locked Stop button) ───────────────
  const doStopRecording = useCallback(() => {
    stopDurationTimer();
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (recorder.state === "recording") {
      recorder.stop();
      // The onstop callback will fire → submitAudio → modal opens
    }
    setGestureState("idle");
  }, [recorder, stopDurationTimer]);

  // ── Cancel recording (discard audio, don't submit) ────────────────────────
  const doCancelRecording = useCallback(() => {
    stopDurationTimer();
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    hasSubmittedRef.current = true; // prevent stale onstop from submitting
    recorder.cancel();
    smartEntry.reset();
    setGestureState("idle");
  }, [recorder, smartEntry, stopDurationTimer]);

  // ── Pointer handlers (the ONLY event handlers — no onClick) ──────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      // Ignore if already recording or processing
      if (recorder.state === "recording" || recorder.state === "requesting" || recorder.state === "stopping") return;
      if (gestureState !== "idle") return;

      // Capture the pointer so pointerup fires even if finger leaves the button
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch { /* non-fatal */ }
      pointerIdRef.current = e.pointerId;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      hasStartedRecordingRef.current = false;

      // Start hold timer — if held for HOLD_THRESHOLD_MS, start recording
      setGestureState("holding");
      holdTimerRef.current = setTimeout(() => {
        doStartRecording();
      }, HOLD_THRESHOLD_MS);
    },
    [recorder.state, gestureState, doStartRecording],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPosRef.current) return;
      if (pointerIdRef.current !== e.pointerId) return;
      if (gestureState !== "recording") return;

      const dy = e.clientY - startPosRef.current.y;
      // Swipe UP (negative dy) past threshold → lock
      if (dy < -LOCK_THRESHOLD_PX) {
        setGestureState("locked");
      }
    },
    [gestureState],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Suppress the synthetic click that follows a pointer gesture
      e.preventDefault();
      e.stopPropagation();

      if (pointerIdRef.current !== e.pointerId) return;
      pointerIdRef.current = null;

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { /* non-fatal */ }

      // Clear the hold timer if it hasn't fired yet (short tap)
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      // If recording never started (short tap), open the modal for text entry
      if (!hasStartedRecordingRef.current) {
        setGestureState("idle");
        startPosRef.current = null;
        onModalOpen();
        return;
      }

      // If locked, releasing does NOT stop recording
      if (gestureState === "locked") {
        startPosRef.current = null;
        return;
      }

      // If recording (unlocked), stop + submit
      if (gestureState === "recording") {
        doStopRecording();
        startPosRef.current = null;
        return;
      }

      // Default: reset
      setGestureState("idle");
      startPosRef.current = null;
    },
    [gestureState, doStopRecording, onModalOpen],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      pointerIdRef.current = null;

      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      // If recording was started, cancel it (discard audio)
      if (hasStartedRecordingRef.current) {
        doCancelRecording();
      }

      setGestureState("idle");
      startPosRef.current = null;
      hasStartedRecordingRef.current = false;
    },
    [doCancelRecording],
  );

  // ── Derived visual state ──────────────────────────────────────────────────
  const isRecording = gestureState === "recording";
  const isLocked = gestureState === "locked";
  const isHolding = gestureState === "holding";
  const isActive = isRecording || isLocked || isHolding;
  const isError = recorder.state === "denied" || recorder.state === "unsupported" || recorder.state === "error";
  const isProcessing = smartEntry.state === "transcribing" || smartEntry.state === "interpreting";

  // Audio level visualization
  const pulseSize = isActive ? 80 + Math.min(40, recorder.levels * 80) : 80;

  return (
    <>
      {/* ── Compact recording pill (appears above the FAB) ──────────────────── */}
      {(isActive || isProcessing || isError) && (
        <div
          className="fixed bottom-[9rem] z-[35] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 shadow-lg"
          style={{ right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))" }}
        >
          {isError ? (
            <>
              <AlertCircle className="h-4 w-4 text-red-400" />
              <span className="text-xs font-medium text-white">
                {recorder.state === "denied" ? t("smartentry.recording.micDeniedShort") : t("smartentry.recording.error")}
              </span>
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              <span className="text-xs font-medium text-white">{t("smartentry.loading.listening")}</span>
            </>
          ) : isLocked ? (
            <>
              <Lock className="h-3.5 w-3.5 text-white" />
              <span className="font-mono text-sm font-bold text-white">{fmt(duration)}</span>
              <button
                type="button"
                onClick={doCancelRecording}
                className="ml-2 flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/30"
              >{t("smartentry.action.cancel")}</button>
              <button
                type="button"
                onClick={doStopRecording}
                className="flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
              >{t("smartentry.action.send")}</button>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" style={{ animation: "rec-blink 1s infinite" }} />
              <span className="font-mono text-sm font-bold text-white">{fmt(duration)}</span>
              <span className="text-xs text-white/60 flex items-center gap-0.5">
                <ArrowUp className="h-3 w-3" /> {t("smartentry.recording.lockHintShort")}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── The FAB ─────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // NO onClick — prevents synthetic click duplicates
        disabled={isError || recorder.state === "requesting" || recorder.state === "stopping"}
        className={cn(
          "fixed bottom-[5.5rem] z-30 flex h-16 w-16 touch-none select-none items-center justify-center rounded-full text-white shadow-xl transition-transform",
          isRecording
            ? "bg-red-500 shadow-red-500/40 scale-110"
            : isLocked
            ? "bg-amber-600 shadow-amber-600/40"
            : isHolding
            ? "bg-brand-700 shadow-brand-700/40 scale-95"
            : "bg-gradient-to-br from-brand-600 via-brand-700 to-purple-700 shadow-brand-600/40 hover:scale-110 active:scale-95",
        )}
        style={{
          right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))",
          touchAction: "none",
        }}
        aria-label={
          isRecording ? t("smartentry.aria.fabRecording") :
          isLocked ? t("smartentry.aria.fabLocked") :
          isProcessing ? t("smartentry.aria.fabProcessing") :
          t("smartentry.aria.fabIdle")
        }
      >
        {/* Pulse ring */}
        {isRecording ? (
          <span
            className="absolute inset-0 rounded-full bg-red-500/40"
            style={{ animation: "smart-mic-pulse 1.5s ease-out infinite" }}
            aria-hidden
          />
        ) : !isActive && !isProcessing ? (
          <span
            className="absolute inset-0 rounded-full bg-brand-500/40"
            style={{ animation: "smart-mic-pulse 2.4s ease-out infinite" }}
            aria-hidden
          />
        ) : null}

        {/* Sparkles badge (only when idle) */}
        {!isActive && !isProcessing && !isError ? (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-white">
            <Sparkles className="h-3 w-3" />
          </span>
        ) : null}

        {/* Icon */}
        {isError ? (
          <AlertCircle className="relative h-7 w-7" />
        ) : isProcessing ? (
          <Loader2 className="relative h-7 w-7 animate-spin" />
        ) : isLocked ? (
          <Lock className="relative h-7 w-7" />
        ) : (
          <Mic className="relative h-7 w-7" strokeWidth={2.25} />
        )}

        <style>{`
          @keyframes smart-mic-pulse {
            0% { transform: scale(1); opacity: 0.55; }
            70% { transform: scale(1.6); opacity: 0; }
            100% { transform: scale(1.6); opacity: 0; }
          }
          @keyframes rec-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </button>
    </>
  );
}
