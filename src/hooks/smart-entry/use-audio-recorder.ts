"use client";

/**
 * useAudioRecorder — browser microphone recorder with auto-stop on silence.
 *
 * Uses the MediaRecorder API to capture audio from the user's microphone,
 * detects the best-supported mimeType (webm/opus preferred, falls back to
 * mp4 or wav), and exposes start/stop + the recorded Blob.
 *
 * Also implements simple silence detection via the Web Audio API: if the
 * audio level stays below a threshold for >2 seconds, auto-stop recording.
 *
 * Always releases the microphone stream when recording stops or the
 * component unmounts — never keep mic access active after the user is done.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "requesting" | "recording" | "stopping" | "denied" | "unsupported" | "error";

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number>(0); // 0..1 instantaneous audio level

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const onStopCallbackRef = useRef<((blob: Blob, mimeType: string) => void) | null>(null);

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
    for (const type of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "audio/webm"; // last-ditch fallback
  }, []);

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const start = useCallback(async (onStop?: (blob: Blob, mimeType: string) => void) => {
    setError(null);
    setAudioBlob(null);
    setAudioMimeType(null);
    onStopCallbackRef.current = onStop ?? null;

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      setError("Your browser doesn't support audio recording.");
      return;
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
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
        setState("denied");
        setError("Microphone permission denied. Please allow it in your browser settings.");
      } else {
        setState("error");
        setError(e instanceof Error ? e.message : "Failed to access microphone.");
      }
      return;
    }

    streamRef.current = stream;
    const mimeType = pickMimeType();
    setAudioMimeType(mimeType);

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setAudioBlob(blob);
      cleanup();
      setState("idle");
      onStopCallbackRef.current?.(blob, mimeType);
    };

    recorder.onerror = () => {
      setError("Recording failed. Please try again.");
      setState("error");
      cleanup();
    };

    // Set up Web Audio API for silence detection + level meter
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        // Compute average level 0..1
        const sum = data.reduce((a, b) => a + b, 0);
        const avg = sum / data.length / 255;
        setLevels(avg);

        // Reset silence timer if we hear sound
        if (avg > 0.05) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          silenceTimerRef.current = window.setTimeout(() => {
            // Auto-stop after 2s of silence
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          }, 2000);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Web Audio API failure is non-fatal — recording still works, just no silence detection
    }

    recorder.start();
    setState("recording");

    // Hard cap at 30 seconds — never let a user record more than that
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, 30000);
  }, [cleanup, pickMimeType]);

  const stop = useCallback(() => {
    setState("stopping");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      cleanup();
      setState("idle");
    }
  }, [cleanup]);

  /**
   * Cancel an in-flight recording WITHOUT firing the onStop callback.
   *
   * Used when the user taps "Cancel" during recording — we want to stop
   * the mic and discard the audio, NOT submit it to the API. The recorder's
   * own onstop handler will still fire (browser behavior), but because we
   * null out onStopCallbackRef first, the audio won't be submitted.
   */
  const cancel = useCallback(() => {
    onStopCallbackRef.current = null;
    setState("stopping");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      cleanup();
      setState("idle");
    }
  }, [cleanup]);

  return {
    state,
    audioBlob,
    audioMimeType,
    error,
    levels,
    start,
    stop,
    cancel,
  };
}
