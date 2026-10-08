"use client";

/**
 * HoldToRecordButton — compact, mobile-first WhatsApp-style press-and-hold.
 *
 * DESIGN RULES (from user spec):
 *   - NO fullscreen overlay
 *   - NO dashboard blur
 *   - NO giant center microphone
 *   - NO desktop hold-to-record (desktop = normal click → Smart Entry modal)
 *   - Mobile: TAP → Smart Entry modal; HOLD → compact recording near button
 *
 * The button itself transforms into a recording control. A small pill appears
 * above the button with timer + hint text. The Dashboard stays fully visible.
 *
 * LAYOUT (bottom-right, where the FAB lives):
 *
 *   ┌──────────────────────────┐
 *   │  🔴 00:04   ↑ slide to lock │   ← small pill (only while recording)
 *   └──────────────────────────┘
 *   ┌────┐
 *   │ 🎙 │   ← the button itself (turns red while recording)
 *   └────┘
 *
 * When LOCKED:
 *   ┌──────────────────────────┐
 *   │  🔒 00:08    [Cancel] [Send] │  ← locked pill
 *   └──────────────────────────┘
 *   ┌────┐
 *   │ 🔴 │
 *   └────┘
 *
 * When CANCEL pending (finger dragged away):
 *   ┌──────────────────────────┐
 *   │  ✕ Release to cancel       │  ← cancel pill
 *   └──────────────────────────┘
 *   ┌────┐
 *   │ 🎙 │
 *   └────┘
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, Lock, X, Send, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";
import { SmartEntryModal } from "@/components/smart-entry/SmartEntryModal";
import { cn } from "@/lib/utils/cn";

// ── Constants ────────────────────────────────────────────────────────────────
const HOLD_THRESHOLD_MS = 150;
const LOCK_THRESHOLD_PX = 80;
const CANCEL_THRESHOLD_PX = 60;
const MAX_RECORDING_MS = 30_000;

// ── State ────────────────────────────────────────────────────────────────────
type RecordState =
  | "IDLE"
  | "HOLD_PENDING"
  | "RECORDING"
  | "LOCKED"
  | "CANCEL_PENDING"
  | "PROCESSING"
  | "ERROR";

export function HoldToRecordButton() {
  const [modalOpen, setModalOpen] = useState(false);
  const smartEntry = useSmartEntry();

  // Recording state
  const [recState, setRecState] = useState<RecordState>("IDLE");
  const [recError, setRecError] = useState<string | null>(null);
  const [recDuration, setRecDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs — no re-renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const mimeTypeRef = useRef("audio/webm");
  const isTouchRef = useRef(false);
  const isPointerDownRef = useRef(false);

  // ── Detect touch device ───────────────────────────────────────────────────
  // On desktop (mouse), we DON'T do hold-to-record — just normal click → modal.
  // On touch (mobile/tablet), we DO the WhatsApp-style hold gesture.
  useEffect(() => {
    const detectTouch = () => {
      isTouchRef.current =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches;
    };
    detectTouch();
    window.addEventListener("touchstart", detectTouch, { once: true });
    return () => window.removeEventListener("touchstart", detectTouch);
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setAudioLevel(0);
    setRecDuration(0);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Pick mimeType ──────────────────────────────────────────────────────────
  const pickMimeType = (): string => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"];
    for (const t of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "audio/webm";
  };

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecState("ERROR");
      setRecError("Your browser doesn't support audio recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        if (blob.size < 1024) {
          setRecState("ERROR");
          setRecError("Recording too short. Please try again.");
          return;
        }
        setRecState("PROCESSING");
        smartEntry.submitAudio(blob, mimeType);
      };
      recorder.onerror = () => { cleanup(); setRecState("ERROR"); setRecError("Recording failed."); };

      recorder.start();
      setRecState("RECORDING");
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setRecDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Audio level (requestAnimationFrame, no React re-render for the value itself)
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(data);
          setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length / 255);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch { /* non-fatal */ }

      maxTimerRef.current = setTimeout(() => {
        mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop();
      }, MAX_RECORDING_MS);
    } catch (e) {
      cleanup();
      setRecState("ERROR");
      setRecError(
        e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")
          ? "Microphone permission denied."
          : e instanceof Error ? e.message : "Failed to access microphone."
      );
    }
  }, [cleanup, smartEntry]);

  // ── Stop + send ─────────────────────────────────────────────────────────────
  const stopAndSend = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else { cleanup(); setRecState("IDLE"); }
  }, [cleanup]);

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.state === "recording" && mediaRecorderRef.current.stop();
    }
    cleanup();
    setRecState("IDLE");
  }, [cleanup]);

  // ── Pointer handlers (only for touch devices) ──────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only activate hold-to-record on touch devices
    if (!isTouchRef.current) return;
    if (recState !== "IDLE") return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    isPointerDownRef.current = true;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    setRecState("HOLD_PENDING");
    holdTimerRef.current = setTimeout(() => { startRecording(); }, HOLD_THRESHOLD_MS);
  }, [recState, startRecording]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current || !isPointerDownRef.current) return;
    if (recState !== "RECORDING") return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (dy < -LOCK_THRESHOLD_PX) { setRecState("LOCKED"); return; }
    if (Math.abs(dx) > CANCEL_THRESHOLD_PX || dy > CANCEL_THRESHOLD_PX) { setRecState("CANCEL_PENDING"); return; }
  }, [recState]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    isPointerDownRef.current = false;
    if (recState === "HOLD_PENDING") {
      clearTimeout(holdTimerRef.current!);
      setRecState("IDLE");
      startPosRef.current = null;
      setModalOpen(true); // TAP → open Smart Entry modal
      return;
    }
    if (recState === "RECORDING") { stopAndSend(); startPosRef.current = null; return; }
    if (recState === "CANCEL_PENDING") { cancelRecording(); startPosRef.current = null; return; }
    if (recState === "ERROR") { setRecState("IDLE"); setRecError(null); }
    startPosRef.current = null;
  }, [recState, stopAndSend, cancelRecording]);

  // ── Open modal when smartEntry reaches form/success/error ───────────────────
  useEffect(() => {
    if (smartEntry.state === "form" || smartEntry.state === "success" || smartEntry.state === "error" || smartEntry.state === "cancelled") {
      setModalOpen(true);
      if (recState === "PROCESSING") setRecState("IDLE");
    }
  }, [smartEntry.state, recState]);

  // ── Normal click for desktop ───────────────────────────────────────────────
  const onClick = useCallback(() => {
    // On desktop (non-touch), a normal click opens the modal.
    // On touch, the pointer handlers manage tap-vs-hold, so we skip the click.
    if (!isTouchRef.current) {
      setModalOpen(true);
    }
  }, []);

  // ── Format timer ───────────────────────────────────────────────────────────
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Derived ─────────────────────────────────────────────────────────────────
  const showRec = recState !== "IDLE";
  const isRec = recState === "RECORDING" || recState === "LOCKED";
  const isLocked = recState === "LOCKED";
  const isCancel = recState === "CANCEL_PENDING";
  const isProcessing = recState === "PROCESSING" || smartEntry.state === "transcribing" || smartEntry.state === "interpreting";
  const isError = recState === "ERROR";

  return (
    <>
      {/* ── Compact recording pill (appears above the button) ────────────── */}
      {showRec ? (
        <div
          className="fixed bottom-[9rem] z-[35] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 shadow-lg"
          style={{ right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))" }}
        >
          {isError ? (
            <>
              <AlertCircle className="h-4 w-4 text-red-400" />
              <span className="text-xs font-medium text-white">{recError}</span>
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              <span className="text-xs font-medium text-white">
                {smartEntry.state === "transcribing" ? "Listening..." : "Understanding..."}
              </span>
            </>
          ) : isLocked ? (
            <>
              <Lock className="h-3.5 w-3.5 text-white" />
              <span className="font-mono text-sm font-bold text-white">{fmt(recDuration)}</span>
              <button
                type="button"
                onClick={cancelRecording}
                className="ml-2 flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/30"
              >Cancel</button>
              <button
                type="button"
                onClick={stopAndSend}
                className="flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
              >Send</button>
            </>
          ) : isCancel ? (
            <>
              <X className="h-4 w-4 text-red-400" />
              <span className="text-xs font-medium text-white">Release to cancel</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" style={{ animation: "rec-blink 1s infinite" }} />
              <span className="font-mono text-sm font-bold text-white">{fmt(recDuration)}</span>
              <span className="text-xs text-white/60">↑ lock</span>
            </>
          )}
        </div>
      ) : null}

      {/* ── The button ───────────────────────────────────────────────────── */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClick}
        className={cn(
          "fixed bottom-[5.5rem] right-0 z-30 flex h-16 w-16 touch-none select-none items-center justify-center rounded-full text-white shadow-xl transition-transform",
          isRec
            ? "bg-red-500 shadow-red-500/40 scale-110"
            : "bg-gradient-to-br from-brand-600 via-brand-700 to-purple-700 shadow-brand-600/40 hover:scale-110 active:scale-95",
        )}
        style={{
          right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))",
          touchAction: "none",
        }}
        aria-label="Smart Khata voice entry — tap for menu, hold to record"
      >
        {/* Pulse ring (only when recording) */}
        {isRec ? (
          <span
            className="absolute inset-0 rounded-full bg-red-500/40"
            style={{ animation: "smart-mic-pulse 1.5s ease-out infinite" }}
            aria-hidden
          />
        ) : (
          <span
            className="absolute inset-0 rounded-full bg-brand-500/40"
            style={{ animation: "smart-mic-pulse 2.4s ease-out infinite" }}
            aria-hidden
          />
        )}

        {/* Sparkles badge (only when idle) */}
        {!showRec ? (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-white">
            <Sparkles className="h-3 w-3" />
          </span>
        ) : null}

        {/* Icon */}
        {isError ? (
          <AlertCircle className="relative h-7 w-7" />
        ) : isProcessing ? (
          <Loader2 className="relative h-7 w-7 animate-spin" />
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

      {/* ── Smart Entry Modal (opens on tap or after audio processing) ────── */}
      <SmartEntryModal open={modalOpen} onClose={() => { setModalOpen(false); smartEntry.reset(); }} />
    </>
  );
}
