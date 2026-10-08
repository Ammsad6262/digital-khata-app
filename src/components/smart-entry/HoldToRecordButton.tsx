"use client";

/**
 * HoldToRecordButton — WhatsApp-style press-and-hold voice button.
 *
 * NORMAL TAP → opens SmartEntryModal (existing behavior)
 * PRESS + HOLD → starts recording immediately
 * RELEASE → stops + sends audio to Smart Entry pipeline
 * SWIPE UP → locks recording (continues without holding)
 * DRAG AWAY → cancel (discard audio)
 *
 * This component manages its OWN state locally (useHoldToRecord hook)
 * to avoid re-rendering the Dashboard. The SmartEntryModal is rendered
 * as a child and opened on tap OR when audio is processed.
 *
 * PERFORMANCE:
 *   - The recording timer updates once per second (not 100ms)
 *   - The audio level uses requestAnimationFrame (no React re-render)
 *   - The button uses CSS transforms for animations (GPU-composited)
 *   - Only this component re-renders during recording, not the Dashboard
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, Sparkles, Lock, X, Send, Loader2, AlertCircle } from "lucide-react";
import { useHoldToRecord } from "@/hooks/smart-entry/use-hold-to-record";
import { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";
import { SmartEntryModal } from "@/components/smart-entry/SmartEntryModal";
import { cn } from "@/lib/utils/cn";

export function HoldToRecordButton() {
  const [modalOpen, setModalOpen] = useState(false);
  const smartEntry = useSmartEntry();
  const holdToRecord = useHoldToRecord();

  // ── Wire up callbacks ─────────────────────────────────────────────────────
  // On tap → open Smart Entry modal
  holdToRecord.setOnTap(useCallback(() => {
    setModalOpen(true);
  }, []));

  // On audio ready → submit to the Smart Entry pipeline
  holdToRecord.setOnAudioReady(useCallback((blob: Blob, mimeType: string) => {
    smartEntry.submitAudio(blob, mimeType);
  }, [smartEntry]));

  // When smartEntry reaches a terminal state (success/error/cancelled),
  // reset holdToRecord to IDLE
  useEffect(() => {
    if (smartEntry.state === "success" || smartEntry.state === "error" || smartEntry.state === "cancelled") {
      if (holdToRecord.state === "PROCESSING") {
        // Reset after a short delay so the user sees the result
        setTimeout(() => {
          holdToRecord.stopAndSend(); // this will just reset to IDLE since recorder is already stopped
        }, 100);
      }
    }
  }, [smartEntry.state, holdToRecord]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isRecording = holdToRecord.state === "RECORDING" || holdToRecord.state === "LOCKED";
  const isProcessing = holdToRecord.state === "PROCESSING" || smartEntry.state === "transcribing" || smartEntry.state === "interpreting";
  const isError = holdToRecord.state === "ERROR";
  const isLocked = holdToRecord.state === "LOCKED";
  const isCancelPending = holdToRecord.state === "CANCEL_PENDING";

  // If smartEntry is showing the form (AI succeeded), open the modal
  useEffect(() => {
    if (smartEntry.state === "form" || smartEntry.state === "success" || smartEntry.state === "error" || smartEntry.state === "cancelled") {
      setModalOpen(true);
    }
  }, [smartEntry.state]);

  // ── Format timer ──────────────────────────────────────────────────────────
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // ── Recording overlay ──────────────────────────────────────────────────────
  const showOverlay = isRecording || isProcessing || isError;

  return (
    <>
      {/* ── Main button ─────────────────────────────────────────────────────── */}
      {!showOverlay ? (
        <button
          type="button"
          onPointerDown={holdToRecord.onPointerDown}
          onPointerMove={holdToRecord.onPointerMove}
          onPointerUp={holdToRecord.onPointerUp}
          onPointerLeave={holdToRecord.onPointerLeave}
          className="group fixed bottom-[5.5rem] right-0 z-30 flex h-16 w-16 touch-none select-none items-center justify-center rounded-full bg-gradient-to-br from-brand-600 via-brand-700 to-purple-700 text-white shadow-xl shadow-brand-600/40 transition-transform hover:scale-110 active:scale-95"
          style={{
            right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))",
            touchAction: "none", // prevent scrolling while holding
          }}
          aria-label="Smart Khata voice entry — tap for menu, hold to record"
        >
          <span
            className="absolute inset-0 rounded-full bg-brand-500/40"
            style={{
              animation: "smart-mic-pulse 2.4s ease-out infinite",
            }}
            aria-hidden
          />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-white">
            <Sparkles className="h-3 w-3" />
          </span>
          <Mic className="relative h-7 w-7" strokeWidth={2.25} />
          <style>{`
            @keyframes smart-mic-pulse {
              0%   { transform: scale(1);   opacity: 0.55; }
              70%  { transform: scale(1.6); opacity: 0;    }
              100% { transform: scale(1.6); opacity: 0;    }
            }
          `}</style>
        </button>
      ) : null}

      {/* ── Recording overlay ──────────────────────────────────────────────── */}
      {showOverlay ? (
        <RecordingOverlay
          state={holdToRecord.state}
          error={holdToRecord.error}
          duration={holdToRecord.recordingDuration}
          audioLevel={holdToRecord.audioLevel}
          smartEntryState={smartEntry.state}
          onCancel={holdToRecord.cancelRecording}
          onStopAndSend={holdToRecord.stopAndSend}
          formatTime={formatTime}
        />
      ) : null}

      {/* ── Smart Entry Modal (opens on tap or after audio processing) ────── */}
      <SmartEntryModal open={modalOpen} onClose={() => {
        setModalOpen(false);
        smartEntry.reset();
      }} />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// RecordingOverlay — the full-screen overlay shown during recording/processing
// ────────────────────────────────────────────────────────────────────────────────

function RecordingOverlay({
  state,
  error,
  duration,
  audioLevel,
  smartEntryState,
  onCancel,
  onStopAndSend,
  formatTime,
}: {
  state: string;
  error: string | null;
  duration: number;
  audioLevel: number;
  smartEntryState: string;
  onCancel: () => void;
  onStopAndSend: () => void;
  formatTime: (s: number) => string;
}) {
  const isRecording = state === "RECORDING";
  const isLocked = state === "LOCKED";
  const isCancelPending = state === "CANCEL_PENDING";
  const isProcessing = state === "PROCESSING" || smartEntryState === "transcribing" || smartEntryState === "interpreting";
  const isError = state === "ERROR";

  // Audio level → visual circle size
  const circleSize = isRecording ? 80 + Math.min(30, audioLevel * 60) : 80;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[80] transition-opacity duration-150",
          isError ? "bg-red-900/40" : isCancelPending ? "bg-red-900/50" : "bg-black/50",
        )}
        style={{ backdropFilter: "blur(2px)" }}
      />

      {/* Center content */}
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center px-6">
        {isError ? (
          // ── Error state ──────────────────────────────────────────────────
          <div className="max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Recording Error</p>
            <p className="mt-1 text-xs text-slate-500">{error ?? "Something went wrong."}</p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Dismiss
            </button>
          </div>
        ) : isProcessing ? (
          // ── Processing state ─────────────────────────────────────────────
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
            <p className="text-sm font-semibold text-white">
              {smartEntryState === "transcribing" ? "Listening..." : "Understanding..."}
            </p>
          </div>
        ) : isLocked ? (
          // ── Locked recording ────────────────────────────────────────────
          <div className="flex flex-col items-center gap-6">
            {/* Lock indicator + timer */}
            <div className="flex items-center gap-3 rounded-full bg-white/20 px-4 py-2 backdrop-blur">
              <Lock className="h-4 w-4 text-white" />
              <span className="font-mono text-lg font-bold text-white">{formatTime(duration)}</span>
              <span
                className="h-2.5 w-2.5 rounded-full bg-red-500"
                style={{ animation: "rec-blink 1s ease-in-out infinite" }}
              />
            </div>

            {/* Audio level indicator */}
            <div
              className="rounded-full bg-red-500/40 transition-transform duration-100"
              style={{ width: circleSize, height: circleSize }}
            >
              <div className="flex h-full w-full items-center justify-center">
                <Mic className="h-8 w-8 text-white" />
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-2 rounded-xl bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/30 active:scale-95"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={onStopAndSend}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-brand-700 active:scale-95"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </div>
          </div>
        ) : (
          // ── Active recording (finger still down) ────────────────────────
          <div className="flex flex-col items-center gap-4">
            {/* Timer */}
            <div className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 backdrop-blur">
              <span
                className="h-2.5 w-2.5 rounded-full bg-red-500"
                style={{ animation: "rec-blink 1s ease-in-out infinite" }}
              />
              <span className="font-mono text-base font-bold text-white">{formatTime(duration)}</span>
            </div>

            {/* Mic circle with audio level */}
            <div className="relative flex items-center justify-center" style={{ height: 160 }}>
              {/* Cancel indicator */}
              {isCancelPending ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
                      <X className="h-8 w-8" strokeWidth={3} />
                    </div>
                    <span className="text-sm font-semibold text-white">Release to cancel</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Pulse ring */}
                  <div
                    className="absolute rounded-full bg-red-500/30 transition-transform duration-100"
                    style={{ width: circleSize, height: circleSize }}
                  />
                  {/* Inner circle */}
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40">
                    <Mic className="h-8 w-8" />
                  </div>
                </>
              )}
            </div>

            {/* Hint text */}
            {!isCancelPending ? (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium text-white">Recording...</p>
                <p className="text-xs text-white/60">↑ Swipe up to lock · ← Drag away to cancel</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <style>{`
        @keyframes rec-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
