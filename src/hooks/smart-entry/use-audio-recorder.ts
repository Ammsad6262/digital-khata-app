"use client";

/**
 * useAudioRecorder — browser microphone recorder with auto-stop on silence.
 *
 * Uses the MediaRecorder API to capture audio from the user's microphone,
 * detects the best-supported mimeType (webm/opus preferred, falls back to
 * mp4 or ogg), and exposes start/stop/cancel + the recorded Blob.
 *
 * Recording limits are shared with the SpeechRecognition path:
 *   - a natural pause is tolerated for `silenceGraceMs` (4 s by default),
 *   - the hard safety cap is `maxDurationMs` (60 s by default),
 *   - stopping manually always wins over the timers,
 *   - a previous session's timers can never stop the next session.
 *
 * Always releases the microphone stream when recording stops or the
 * component unmounts — never keep mic access active after the user is done.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveRecordingConfig,
  type RecordingConfig,
} from "@/lib/voice/recording-config";

type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "denied"
  | "unsupported"
  | "error";

export type RecorderEndReason = "manual" | "silence" | "max-duration" | "error";

type Options = {
  /** Tests pass shorter limits; the product uses RECORDING_DEFAULTS. */
  config?: Partial<RecordingConfig>;
};

export function useAudioRecorder(options: Options = {}) {
  const config = useMemo(
    () => resolveRecordingConfig(options.config),
    [options.config],
  );

  const [state, setState] = useState<RecorderState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number>(0); // 0..1 instantaneous audio level
  const [elapsedMs, setElapsedMs] = useState(0);
  const [endedReason, setEndedReason] = useState<RecorderEndReason | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const stopFallbackRef = useRef<number | null>(null);
  const onStopCallbackRef = useRef<((blob: Blob, mimeType: string) => void) | null>(null);

  /** Every async callback checks this token; an old session is inert. */
  const sessionRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const stoppingRef = useRef(false);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);

  const configRef = useRef(config);
  configRef.current = config;

  const clearTimer = useCallback((ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const clearStopTimers = useCallback(() => {
    clearTimer(silenceTimerRef);
    clearTimer(maxTimerRef);
    clearTimer(stopFallbackRef);
  }, [clearTimer]);

  /** Detect the best-supported audio mimeType the browser can record. */
  const pickMimeType = useCallback((): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/wav",
    ];
    if (
      typeof MediaRecorder !== "undefined" &&
      typeof MediaRecorder.isTypeSupported === "function"
    ) {
      for (const type of candidates) {
        if (MediaRecorder.isTypeSupported(type)) return type;
      }
    }
    return "audio/webm"; // last-ditch fallback
  }, []);

  const cleanup = useCallback(() => {
    clearStopTimers();
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [clearStopTimers]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const start = useCallback(
    async (onStop?: (blob: Blob, mimeType: string) => void): Promise<boolean> => {
      // Repeated taps must not create two live recorders.
      if (sessionActiveRef.current) return false;

      const session = sessionRef.current + 1;
      sessionRef.current = session;
      sessionActiveRef.current = true;
      stoppingRef.current = false;
      cancelledRef.current = false;
      onStopCallbackRef.current = onStop ?? null;
      chunksRef.current = [];

      setError(null);
      setAudioBlob(null);
      setAudioMimeType(null);
      setEndedReason(null);
      setElapsedMs(0);
      setLevels(0);
      startedAtRef.current = null;

      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        sessionActiveRef.current = false;
        setState("unsupported");
        setError("smartentry.micError.unsupportedLong");
        return false;
      }

      setState("requesting");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1, // mono is enough for voice
          },
        });
      } catch (e) {
        if (session !== sessionRef.current) return false; // superseded/cancelled
        sessionActiveRef.current = false;
        if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
          setState("denied");
          setError("smartentry.micError.deniedWithSettings");
        } else {
          setState("error");
          setError(e instanceof Error ? e.message : "smartentry.micError.accessFailed");
        }
        return false;
      }

      // The owner may have cancelled while the permission prompt was open.
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      streamRef.current = stream;
      const mimeType = pickMimeType();
      setAudioMimeType(mimeType);

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        // Some browsers reject a specific mime type even after reporting it
        // as supported; try the browser default before giving up.
        try {
          recorder = new MediaRecorder(stream);
        } catch {
          cleanup();
          sessionActiveRef.current = false;
          setState("unsupported");
          setError("smartentry.micError.unsupportedLong");
          return false;
        }
      }
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (session !== sessionRef.current) return;
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (session !== sessionRef.current) return;
        const wasCancelled = cancelledRef.current;
        const callback = onStopCallbackRef.current;
        onStopCallbackRef.current = null;

        const finalMimeType = recorder.mimeType || mimeType;
        const blob = new Blob(chunksRef.current, { type: finalMimeType });
        chunksRef.current = [];
        cleanup();
        sessionActiveRef.current = false;
        stoppingRef.current = false;
        setState("idle");

        if (wasCancelled) {
          setAudioBlob(null);
          return;
        }

        if (blob.size === 0) {
          setAudioBlob(null);
          setError("smartentry.recording.failedRetry");
          setEndedReason("error");
          setState("error");
          return;
        }

        setAudioBlob(blob);
        setAudioMimeType(finalMimeType);
        // Fire the callback AFTER state is set so the component re-renders
        // with "idle" before the async submit kicks in.
        if (callback) queueMicrotask(() => callback(blob, finalMimeType));
      };

      recorder.onerror = () => {
        if (session !== sessionRef.current) return;
        cancelledRef.current = true;
        onStopCallbackRef.current = null;
        setError("smartentry.recording.failedRetry");
        setEndedReason("error");
        cleanup();
        sessionActiveRef.current = false;
        stoppingRef.current = false;
        setState("error");
      };

      // Set up Web Audio API for silence detection + level meter.
      try {
        const AudioCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtor) throw new Error("Web Audio API unavailable");
        const audioContext = new AudioCtor();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (session !== sessionRef.current) return;
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(data);
          const sum = data.reduce((a, b) => a + b, 0);
          const avg = sum / data.length / 255;
          setLevels(avg);

          // Refresh the pause timer only while there is sound. When the sound
          // stops, the last timer survives and finishes the recording after
          // the shared grace period.
          if (avg > 0.05) {
            clearTimer(silenceTimerRef);
            silenceTimerRef.current = window.setTimeout(() => {
              silenceTimerRef.current = null;
              if (session !== sessionRef.current) return;
              const active = mediaRecorderRef.current;
              if (active && active.state === "recording") {
                setEndedReason("silence");
                try {
                  active.stop();
                } catch {
                  cleanup();
                  sessionActiveRef.current = false;
                  setState("idle");
                }
              }
            }, configRef.current.silenceGraceMs);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Web Audio API failure is non-fatal — recording still works, just no
        // silence detection.
      }

      try {
        recorder.start();
      } catch {
        cleanup();
        sessionActiveRef.current = false;
        setState("error");
        setError("smartentry.recording.failedRetry");
        return false;
      }
      setState("recording");
      startedAtRef.current = Date.now();

      elapsedTimerRef.current = window.setInterval(() => {
        if (session !== sessionRef.current || !sessionActiveRef.current) return;
        if (startedAtRef.current !== null) {
          setElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
        }
      }, 250);

      maxTimerRef.current = window.setTimeout(() => {
        if (session !== sessionRef.current) return;
        const active = mediaRecorderRef.current;
        if (active && active.state === "recording") {
          setEndedReason("max-duration");
          try {
            active.stop();
          } catch {
            cleanup();
            sessionActiveRef.current = false;
            setState("idle");
          }
        }
      }, configRef.current.maxDurationMs);

      return true;
    },
    [cleanup, clearTimer, pickMimeType],
  );

  const stop = useCallback(() => {
    if (stoppingRef.current) return;
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    stoppingRef.current = true;
    clearStopTimers();
    setEndedReason("manual");

    if (recorder.state === "recording") {
      setState("stopping");
      // Force a final data chunk where supported so a very short recording is
      // not lost.
      try {
        recorder.requestData?.();
      } catch {
        /* not supported in this state */
      }
      stopFallbackRef.current = window.setTimeout(() => {
        stopFallbackRef.current = null;
        if (stoppingRef.current) {
          cleanup();
          sessionActiveRef.current = false;
          stoppingRef.current = false;
          setState("idle");
        }
      }, 1_500);
      try {
        recorder.stop();
      } catch {
        cleanup();
        sessionActiveRef.current = false;
        stoppingRef.current = false;
        setState("idle");
      }
      return;
    }

    cleanup();
    sessionActiveRef.current = false;
    stoppingRef.current = false;
    setState("idle");
  }, [cleanup, clearStopTimers]);

  /**
   * Cancel an in-flight recording WITHOUT firing the onStop callback.
   *
   * Used when the owner taps "Cancel" during recording — stop the mic and
   * discard the audio, do not submit it. The recorder's own onstop handler
   * still fires (browser behaviour), but the callback is nulled first.
   */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    onStopCallbackRef.current = null;
    stoppingRef.current = false;
    clearStopTimers();
    setEndedReason(null);
    setAudioBlob(null);
    setAudioMimeType(null);
    setLevels(0);
    setElapsedMs(0);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      setState("stopping");
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
      // Release the microphone immediately; onstop will finish the cleanup.
      cleanup();
      sessionActiveRef.current = false;
      setState("idle");
      return;
    }

    if (!recorder) {
      // A permission request may still be open; invalidate it.
      sessionRef.current += 1;
    }
    cleanup();
    sessionActiveRef.current = false;
    setState("idle");
  }, [cleanup, clearStopTimers]);

  /**
   * Reset the recorder back to idle, clearing any error/denied state.
   * Used by the SmartEntryModal when the owner clicks "Try again" — without
   * this, the recorder stays in the error state.
   */
  const reset = useCallback(() => {
    cancel();
    setError(null);
    setAudioBlob(null);
    setAudioMimeType(null);
    setLevels(0);
    setElapsedMs(0);
    setEndedReason(null);
    setState("idle");
  }, [cancel]);

  return {
    state,
    audioBlob,
    audioMimeType,
    error,
    levels,
    elapsedMs,
    remainingMs: Math.max(0, config.maxDurationMs - elapsedMs),
    maxDurationMs: config.maxDurationMs,
    endedReason,
    start,
    stop,
    cancel,
    reset,
  };
}