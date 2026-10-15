"use client";

/**
 * HoldToTalkButton — a proper hold-to-record microphone button.
 *
 * V8: Restored hold-to-talk with a correct, single-owner pointer-event
 * lifecycle. This fixes all the bugs from the old HoldToRecordButton:
 *
 * ROOT CAUSES OF PREVIOUS BUGS:
 *   1. The old button had BOTH onPointerDown AND onClick handlers. After a
 *      pointer gesture completed, the browser fired a synthetic click,
 *      causing duplicate actions (open modal + start recording).
 *   2. The old button used a 150ms hold threshold — too short. Users
 *      naturally hold for 150-200ms when tapping, causing accidental recordings.
 *   3. The old button had its OWN MediaRecorder, separate from the modal's
 *      useAudioRecorder, causing state-sync bugs.
 *
 * FIXES IN THIS VERSION:
 *   - NO onClick handler. Only pointer events. The synthetic click is
 *     suppressed via e.preventDefault() in pointerup.
 *   - HOLD_THRESHOLD_MS = 300 (longer — less accidental triggers)
 *   - Uses the PARENT'S recorder (passed as prop) — single recording path
 *   - Pointer capture ensures pointerup fires even if finger leaves the button
 *   - touch-action: none prevents scrolling/zooming during hold
 *   - Swipe-up-to-lock with LOCK_THRESHOLD_PX = 60
 *   - Once locked, releasing doesn't stop recording — explicit Stop button needed
 *
 * Lifecycle:
 *   pointerdown → start hold timer (300ms)
 *   hold timer fires → start recording (calls onStartRecording)
 *   pointermove (upward > 60px) → lock recording
 *   pointerup (unlocked) → stop recording (calls onStopRecording)
 *   pointerup (locked) → keep recording (do nothing)
 *   pointercancel → cancel recording
 *
 * A short tap (< 300ms) does NOT start recording — it's treated as a
 * no-op (the modal is already open, so the user sees the ChoiceView).
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { Mic, Lock, ArrowUp, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

const HOLD_THRESHOLD_MS = 300;
const LOCK_THRESHOLD_PX = 60;

type GestureState = "idle" | "holding" | "recording" | "locked" | "cancel_pending";

export function HoldToTalkButton({
  recorderState,
  recorderLevels,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
}: {
  recorderState: string;
  recorderLevels: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
}) {
  const { t } = useLanguage();
  const [gestureState, setGestureState] = useState<GestureState>("idle");
  const [duration, setDuration] = useState(0);

  // Refs — no re-renders for these
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const hasStartedRecordingRef = useRef(false);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, []);

  // ── Reset gesture when recorder returns to idle ──────────────────────────
  // After recording stops + audio is submitted, the recorder goes back to
  // "idle". We reset the gesture state so the button is ready for next time.
  useEffect(() => {
    if (recorderState === "idle" && gestureState !== "idle") {
      setGestureState("idle");
      setDuration(0);
      hasStartedRecordingRef.current = false;
    }
  }, [recorderState, gestureState]);

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

  // ── Pointer handlers ─────────────────────────────────────────────────────
  // These are the ONLY event handlers. No onClick — the synthetic click
  // after a pointer gesture is suppressed by e.preventDefault() in pointerup.

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to primary button (left click / touch)
      if (e.button !== 0) return;
      // Ignore if already recording or processing
      if (recorderState === "recording" || recorderState === "requesting" || recorderState === "stopping") return;
      if (gestureState !== "idle") return;

      // Capture the pointer so pointerup fires even if finger leaves the button
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture can fail if the element is not connected
      }
      pointerIdRef.current = e.pointerId;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      hasStartedRecordingRef.current = false;

      // Start hold timer — if held for HOLD_THRESHOLD_MS, start recording
      setGestureState("holding");
      holdTimerRef.current = setTimeout(() => {
        hasStartedRecordingRef.current = true;
        setGestureState("recording");
        onStartRecording();
        startDurationTimer();
      }, HOLD_THRESHOLD_MS);
    },
    [recorderState, gestureState, onStartRecording, startDurationTimer],
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
      } catch {
        // releasePointerCapture can fail — non-fatal
      }

      // Clear the hold timer if it hasn't fired yet (short tap)
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      // If recording never started (short tap), just reset
      if (!hasStartedRecordingRef.current) {
        setGestureState("idle");
        startPosRef.current = null;
        return;
      }

      // If locked, releasing does NOT stop recording
      if (gestureState === "locked") {
        startPosRef.current = null;
        return;
      }

      // If recording (unlocked), stop + submit
      if (gestureState === "recording") {
        setGestureState("idle");
        stopDurationTimer();
        onStopRecording();
        startPosRef.current = null;
        return;
      }

      // Default: reset
      setGestureState("idle");
      startPosRef.current = null;
    },
    [gestureState, onStopRecording, stopDurationTimer],
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
        onCancelRecording();
        stopDurationTimer();
      }

      setGestureState("idle");
      startPosRef.current = null;
      hasStartedRecordingRef.current = false;
    },
    [onCancelRecording, stopDurationTimer],
  );

  // ── Derived visual state ──────────────────────────────────────────────────
  const isRecording = gestureState === "recording";
  const isLocked = gestureState === "locked";
  const isHolding = gestureState === "holding";
  const isActive = isRecording || isLocked || isHolding;
  const isError = recorderState === "denied" || recorderState === "unsupported" || recorderState === "error";

  // Audio level visualization (0..1 → scale factor)
  const pulseSize = isActive ? 80 + Math.min(40, recorderLevels * 80) : 80;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* ── Status text ──────────────────────────────────────────────────── */}
      {isError ? (
        <p className="text-sm font-medium text-red-600">
          {recorderState === "denied"
            ? t("smartentry.micError.deniedTitle")
            : recorderState === "unsupported"
            ? t("smartentry.recording.notSupported")
            : t("smartentry.recording.error")}
        </p>
      ) : isLocked ? (
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-900">{t("smartentry.recording.locked")}</p>
          <p className="text-xs text-slate-500">{t("smartentry.recording.tapStopWhenDone")}</p>
        </div>
      ) : isRecording ? (
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-900">{t("smartentry.recording.inProgress")}</p>
          <p className="text-xs text-slate-500">{t("smartentry.recording.releaseOrSwipe")}</p>
        </div>
      ) : isHolding ? (
        <p className="text-sm font-medium text-slate-600">{t("smartentry.recording.holdToSpeakLoading")}</p>
      ) : (
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-900">{t("smartentry.recording.holdToSpeak")}</p>
          <p className="text-xs text-slate-500">{t("smartentry.recording.pressAndHoldHint")}</p>
        </div>
      )}

      {/* ── Timer (shown when recording or locked) ──────────────────────── */}
      {(isRecording || isLocked) && (
        <p className="font-mono text-lg font-bold tabular-nums text-slate-900">
          {fmt(duration)}
        </p>
      )}

      {/* ── Microphone button ───────────────────────────────────────────── */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // NO onClick — prevents synthetic click duplicates
        disabled={isError || recorderState === "requesting" || recorderState === "stopping"}
        className={cn(
          "relative flex items-center justify-center rounded-full transition-transform touch-none select-none",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30",
        )}
        style={{
          width: pulseSize,
          height: pulseSize,
          touchAction: "none",
        }}
        aria-label={isRecording ? t("smartentry.aria.recordingRelease") : isLocked ? t("smartentry.aria.recordingLocked") : t("smartentry.aria.holdToSpeak")}
      >
        {/* Pulse ring (when recording) */}
        {isRecording && (
          <span
            className="absolute inset-0 rounded-full bg-red-500/30"
            style={{ animation: "htt-pulse 1.5s ease-out infinite" }}
            aria-hidden
          />
        )}

        {/* Solid circle */}
        <div
          className={cn(
            "relative flex h-full w-full items-center justify-center rounded-full text-white shadow-lg transition-colors",
            isLocked
              ? "bg-amber-600 shadow-amber-600/40"
              : isRecording
              ? "bg-red-500 shadow-red-500/40"
              : isHolding
              ? "bg-brand-700 shadow-brand-700/40 scale-95"
              : "bg-brand-600 shadow-brand-600/30",
          )}
        >
          {isError ? (
            <AlertCircle className="h-7 w-7" />
          ) : recorderState === "requesting" ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : isLocked ? (
            <Lock className="h-7 w-7" />
          ) : (
            <Mic className="h-7 w-7" strokeWidth={2.25} />
          )}
        </div>

        <style>{`
          @keyframes htt-pulse {
            0% { transform: scale(1); opacity: 0.55; }
            70% { transform: scale(1.5); opacity: 0; }
            100% { transform: scale(1.5); opacity: 0; }
          }
        `}</style>
      </button>

      {/* ── Lock hint arrow (shown when recording, not locked) ──────────── */}
      {isRecording && !isLocked && (
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <ArrowUp className="h-4 w-4 animate-bounce" />
          <span className="text-[10px] font-medium">{t("smartentry.recording.swipeUpToLock")}</span>
        </div>
      )}

      {/* ── Stop button (shown when locked) ─────────────────────────────── */}
      {isLocked && (
        <button
          type="button"
          onClick={() => {
            setGestureState("idle");
            stopDurationTimer();
            onStopRecording();
          }}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:scale-95"
        >
          <span className="h-3 w-3 rounded-sm bg-white" />
          {t("smartentry.action.stopAndSend")}
        </button>
      )}

      {/* ── Cancel button (shown when recording, not locked) ───────────── */}
      {isRecording && !isLocked && (
        <button
          type="button"
          onClick={() => {
            setGestureState("idle");
            stopDurationTimer();
            onCancelRecording();
          }}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t("smartentry.action.cancel")}
        </button>
      )}
    </div>
  );
}
