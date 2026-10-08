"use client";

/**
 * useHoldToRecord — WhatsApp-style press-and-hold voice recording hook.
 *
 * STATE MACHINE:
 *   IDLE          → button not pressed, no recording
 *   HOLD_PENDING  → pointer down, waiting to distinguish tap vs hold (150ms)
 *   RECORDING     → hold detected, recording active, finger still down
 *   LOCKED        → user swiped up, recording continues without finger
 *   CANCEL_PENDING→ user dragged to cancel zone, release will discard
 *   PROCESSING    → recording finished, audio being sent to API
 *   ERROR         → mic permission denied / recording failed
 *
 * TAP vs HOLD:
 *   - If pointer is released within 150ms → TAP (open Smart Entry modal)
 *   - If pointer is held past 150ms → HOLD (start recording)
 *
 * SWIPE UP to LOCK:
 *   - While RECORDING, if pointer moves up > 80px from start → LOCKED
 *   - User can release finger, recording continues
 *
 * CANCEL:
 *   - While RECORDING, if pointer moves left/right > 60px from start → CANCEL_PENDING
 *   - If released in CANCEL_PENDING → discard audio, return to IDLE
 *
 * RELEASE:
 *   - While RECORDING (not locked), release → stop + send
 *   - While LOCKED, release does nothing (recording continues)
 *   - While CANCEL_PENDING, release → cancel
 */

import { useRef, useState, useCallback } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const HOLD_THRESHOLD_MS = 150;  // hold this long to start recording
const LOCK_THRESHOLD_PX = 80;   // swipe up this far to lock
const CANCEL_THRESHOLD_PX = 60; // drag this far horizontally to cancel
const MAX_RECORDING_MS = 30_000; // hard cap at 30 seconds

// ── State machine ───────────────────────────────────────────────────────────
export type RecordState =
  | "IDLE"
  | "HOLD_PENDING"
  | "RECORDING"
  | "LOCKED"
  | "CANCEL_PENDING"
  | "PROCESSING"
  | "ERROR";

export type HoldToRecordResult = {
  state: RecordState;
  error: string | null;
  recordingDuration: number; // seconds
  audioLevel: number; // 0..1 for waveform
  // Pointer handlers — attach to the button element
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  // Actions for the locked recording UI
  cancelRecording: () => void;
  stopAndSend: () => void;
  // Called when a tap (not hold) is detected — opens Smart Entry modal
  onTap: (() => void) | null;
  setOnTap: (fn: (() => void) | null) => void;
  // Called when audio is ready — sends to /api/smart-entry/interpret
  onAudioReady: ((blob: Blob, mimeType: string) => void) | null;
  setOnAudioReady: (fn: ((blob: Blob, mimeType: string) => void) | null) => void;
};

export function useHoldToRecord(): HoldToRecordResult {
  const [state, setState] = useState<RecordState>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs (don't trigger re-renders)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const onTapRef = useRef<(() => void) | null>(null);
  const onAudioReadyRef = useRef<((blob: Blob, mimeType: string) => void) | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);
    setRecordingDuration(0);
  }, []);

  // ── Pick supported mimeType ───────────────────────────────────────────────
  const pickMimeType = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
    ];
    for (const t of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "audio/webm";
  };

  // ── Start recording ─────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("ERROR");
      setError("Your browser doesn't support audio recording.");
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

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();

        // If blob is too small (< 1KB), it's likely empty/silent
        if (blob.size < 1024) {
          setState("ERROR");
          setError("Recording too short. Please try again.");
          return;
        }

        setState("PROCESSING");
        onAudioReadyRef.current?.(blob, mimeType);
      };

      recorder.onerror = () => {
        cleanup();
        setState("ERROR");
        setError("Recording failed. Please try again.");
      };

      recorder.start();
      setState("RECORDING");
      startTimeRef.current = Date.now();

      // Timer (updates once per second — not every 100ms, to minimize re-renders)
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);

      // Audio level for waveform (uses requestAnimationFrame — doesn't re-render React)
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
          const sum = data.reduce((a, b) => a + b, 0);
          setAudioLevel(sum / data.length / 255);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Non-fatal — recording still works without waveform
      }

      // Hard cap at 30 seconds
      maxTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (e) {
      cleanup();
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
        setState("ERROR");
        setError("Microphone permission denied. Please allow it in your browser settings.");
      } else {
        setState("ERROR");
        setError(e instanceof Error ? e.message : "Failed to access microphone.");
      }
    }
  }, [cleanup]);

  // ── Stop and send ───────────────────────────────────────────────────────────
  const stopAndSend = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop(); // onstop will fire → calls onAudioReady
    } else {
      cleanup();
      setState("IDLE");
    }
  }, [cleanup]);

  // ── Cancel recording ────────────────────────────────────────────────────────
  const cancelRecording = useCallback(() => {
    // Null out onstop callback so it doesn't send the audio
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }
    cleanup();
    setState("IDLE");
  }, [cleanup]);

  // ── Pointer handlers ───────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (state !== "IDLE") return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    startPosRef.current = { x: e.clientX, y: e.clientY };
    setState("HOLD_PENDING");

    // After HOLD_THRESHOLD_MS, if still pressed → start recording
    holdTimerRef.current = setTimeout(() => {
      // Always proceed — if the timer fires, the user is still holding
      startRecording();
    }, HOLD_THRESHOLD_MS);
  }, [state, startRecording]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current) return;
    if (state !== "RECORDING" && state !== "HOLD_PENDING") return;

    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;

    if (state === "RECORDING") {
      // Check for swipe-up to lock
      if (dy < -LOCK_THRESHOLD_PX) {
        setState("LOCKED");
        return;
      }
      // Check for cancel (horizontal/downward drag)
      if (Math.abs(dx) > CANCEL_THRESHOLD_PX || dy > CANCEL_THRESHOLD_PX) {
        setState("CANCEL_PENDING");
        return;
      }
    }
  }, [state]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    if (state === "HOLD_PENDING") {
      // Quick tap — not a hold
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setState("IDLE");
      startPosRef.current = null;
      onTapRef.current?.();
      return;
    }

    if (state === "RECORDING") {
      // Release while recording → stop and send
      stopAndSend();
      startPosRef.current = null;
      return;
    }

    if (state === "CANCEL_PENDING") {
      // Release in cancel zone → discard
      cancelRecording();
      startPosRef.current = null;
      return;
    }

    // LOCKED → release does nothing (recording continues)
    // PROCESSING → ignore
    // ERROR → reset to IDLE
    if (state === "ERROR") {
      setState("IDLE");
      setError(null);
    }

    startPosRef.current = null;
  }, [state, stopAndSend, cancelRecording]);

  const onPointerLeave = useCallback((e: React.PointerEvent) => {
    // If the pointer leaves the button while RECORDING (not locked),
    // treat as release → stop and send (prevents stuck recording)
    if (state === "RECORDING" || state === "HOLD_PENDING") {
      onPointerUp(e);
    }
  }, [state, onPointerUp]);

  // ── Setters for callbacks ───────────────────────────────────────────────────
  const setOnTap = useCallback((fn: (() => void) | null) => {
    onTapRef.current = fn;
  }, []);

  const setOnAudioReady = useCallback((fn: ((blob: Blob, mimeType: string) => void) | null) => {
    onAudioReadyRef.current = fn;
  }, []);

  return {
    state,
    error,
    recordingDuration,
    audioLevel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    cancelRecording,
    stopAndSend,
    onTap: null, // kept for API compat — use setOnTap
    setOnTap,
    onAudioReady: null,
    setOnAudioReady,
  };
}
