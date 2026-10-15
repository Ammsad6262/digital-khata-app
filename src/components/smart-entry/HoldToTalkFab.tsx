"use client";

/**
 * HoldToTalkFab — Dashboard floating action button with hold-to-record.
 *
 * Interaction:
 *   - HOLD (>150ms) → start recording
 *   - RELEASE (unlocked) → stop → submitAudio → modal opens
 *   - SWIPE UP while holding → lock recording
 *   - SHORT TAP (<150ms) → open modal for text entry
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { Mic, Lock, X, Send, Loader2, Sparkles, ArrowUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";
import type { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";

const HOLD_THRESHOLD_MS = 150;
const LOCK_THRESHOLD_PX = 60;
const MAX_RECORDING_MS = 30_000;

type GestureState = "idle" | "holding" | "recording" | "locked";

export function HoldToTalkFab({
  recorder, smartEntry, onModalOpen,
}: {
  recorder: ReturnType<typeof useAudioRecorder>;
  smartEntry: ReturnType<typeof useSmartEntry>;
  onModalOpen: () => void;
}) {
  const [gestureState, setGestureState] = useState<GestureState>("idle");
  const [duration, setDuration] = useState(0);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const hasStartedRecordingRef = useRef(false);
  const hasSubmittedRef = useRef(false);

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
  }, []);

  // Reset gesture when recorder returns to idle
  useEffect(() => {
    if (recorder.state === "idle" && gestureState !== "idle") {
      setGestureState("idle");
      setDuration(0);
      hasStartedRecordingRef.current = false;
      hasSubmittedRef.current = false;
    }
  }, [recorder.state, gestureState]);

  // Open modal when smartEntry enters processing/form/error/success states
  useEffect(() => {
    if (["transcribing", "interpreting", "form", "error", "success"].includes(smartEntry.state)) {
      onModalOpen();
    }
  }, [smartEntry.state, onModalOpen]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const doStartRecording = useCallback(async () => {
    hasStartedRecordingRef.current = true;
    hasSubmittedRef.current = false;
    setGestureState("recording");
    startTimeRef.current = Date.now();
    setDuration(0);
    durationTimerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    await recorder.start(async (blob, mimeType) => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;
      await smartEntry.submitAudio(blob, mimeType);
    });

    maxTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, MAX_RECORDING_MS);
  }, [recorder, smartEntry]);

  const doStopRecording = useCallback(() => {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    if (recorder.state === "recording") recorder.stop();
    setGestureState("idle");
  }, [recorder]);

  const doCancelRecording = useCallback(() => {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    hasSubmittedRef.current = true;
    recorder.cancel();
    smartEntry.reset();
    setGestureState("idle");
  }, [recorder, smartEntry]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (recorder.state === "recording" || recorder.state === "requesting" || recorder.state === "stopping") return;
    if (gestureState !== "idle") return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    pointerIdRef.current = e.pointerId;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    hasStartedRecordingRef.current = false;
    setGestureState("holding");
    holdTimerRef.current = setTimeout(() => doStartRecording(), HOLD_THRESHOLD_MS);
  }, [recorder.state, gestureState, doStartRecording]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current || pointerIdRef.current !== e.pointerId || gestureState !== "recording") return;
    const dy = e.clientY - startPosRef.current.y;
    if (dy < -LOCK_THRESHOLD_PX) setGestureState("locked");
  }, [gestureState]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (!hasStartedRecordingRef.current) {
      setGestureState("idle");
      startPosRef.current = null;
      onModalOpen();
      return;
    }
    if (gestureState === "locked") { startPosRef.current = null; return; }
    if (gestureState === "recording") { doStopRecording(); startPosRef.current = null; return; }
    setGestureState("idle");
    startPosRef.current = null;
  }, [gestureState, doStopRecording, onModalOpen]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (hasStartedRecordingRef.current) doCancelRecording();
    setGestureState("idle");
    startPosRef.current = null;
    hasStartedRecordingRef.current = false;
  }, [doCancelRecording]);

  const isRecording = gestureState === "recording";
  const isLocked = gestureState === "locked";
  const isHolding = gestureState === "holding";
  const isActive = isRecording || isLocked || isHolding;
  const isError = recorder.state === "denied" || recorder.state === "unsupported" || recorder.state === "error";
  const isProcessing = smartEntry.state === "transcribing" || smartEntry.state === "interpreting";

  return (
    <>
      {(isActive || isProcessing || isError) && (
        <div className="fixed bottom-[9rem] z-[35] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 shadow-lg"
          style={{ right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))" }}>
          {isError ? (
            <><AlertCircle className="h-4 w-4 text-red-400" /><span className="text-xs font-medium text-white">{recorder.state === "denied" ? "Mic denied" : "Recording error"}</span></>
          ) : isProcessing ? (
            <><Loader2 className="h-4 w-4 animate-spin text-white" /><span className="text-xs font-medium text-white">Listening...</span></>
          ) : isLocked ? (
            <><Lock className="h-3.5 w-3.5 text-white" /><span className="font-mono text-sm font-bold text-white">{fmt(duration)}</span>
            <button type="button" onClick={doCancelRecording} className="ml-2 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/30">Cancel</button>
            <button type="button" onClick={doStopRecording} className="rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700">Send</button></>
          ) : (
            <><span className="h-2.5 w-2.5 rounded-full bg-red-500" style={{ animation: "rec-blink 1s infinite" }} /><span className="font-mono text-sm font-bold text-white">{fmt(duration)}</span><span className="flex items-center gap-0.5 text-xs text-white/60"><ArrowUp className="h-3 w-3" /> lock</span></>
          )}
        </div>
      )}
      <button type="button" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
        disabled={isError || recorder.state === "requesting" || recorder.state === "stopping"}
        className={cn("fixed bottom-[5.5rem] z-30 flex h-16 w-16 touch-none select-none items-center justify-center rounded-full text-white shadow-xl transition-transform",
          isRecording ? "scale-110 bg-red-500 shadow-red-500/40" : isLocked ? "bg-amber-600 shadow-amber-600/40" : isHolding ? "scale-95 bg-brand-700 shadow-brand-700/40" : "bg-gradient-to-br from-brand-600 via-brand-700 to-purple-700 shadow-brand-600/40 hover:scale-110 active:scale-95")}
        style={{ right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))", touchAction: "none" }}
        aria-label={isRecording ? "Recording — release to send" : isLocked ? "Recording locked — tap Send" : isProcessing ? "Processing" : "Hold to speak"}>
        {isRecording ? <span className="absolute inset-0 rounded-full bg-red-500/40" style={{ animation: "smart-mic-pulse 1.5s ease-out infinite" }} aria-hidden /> : !isActive && !isProcessing ? <span className="absolute inset-0 rounded-full bg-brand-500/40" style={{ animation: "smart-mic-pulse 2.4s ease-out infinite" }} aria-hidden /> : null}
        {!isActive && !isProcessing && !isError ? <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-white"><Sparkles className="h-3 w-3" /></span> : null}
        {isError ? <AlertCircle className="relative h-7 w-7" /> : isProcessing ? <Loader2 className="relative h-7 w-7 animate-spin" /> : isLocked ? <Lock className="relative h-7 w-7" /> : <Mic className="relative h-7 w-7" strokeWidth={2.25} />}
        <style>{`@keyframes smart-mic-pulse{0%{transform:scale(1);opacity:.55}70%{transform:scale(1.6);opacity:0}100%{transform:scale(1.6);opacity:0}}@keyframes rec-blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      </button>
    </>
  );
}
