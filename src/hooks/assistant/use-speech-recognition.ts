"use client";

/**
 * useSpeechRecognition — fast, free, on-device speech-to-text.
 *
 * Why this exists:
 *   The old flow recorded audio, uploaded it to Gemini, and waited for the
 *   model to transcribe AND extract intent in one call — 5-20 s for a short
 *   sentence, and one of the ~60 daily requests every time.
 *
 *   Browsers can transcribe locally (Chrome, Edge, Android Chrome, Safari 14+).
 *   That is effectively instant, costs nothing, and leaves the AI budget for
 *   the commands that genuinely need reasoning. When the browser cannot do it
 *   (`supported === false`, e.g. Firefox desktop), the caller falls back to
 *   uploading audio.
 *
 * It also exposes timing so we can measure recognition speed honestly:
 *   - `startedAt`     : when listening began
 *   - `firstPartialMs`: time to the first interim word
 *   - `finalMs`       : time from speech end to the final transcript
 */

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
  length: number;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechLanguage = "en-PK" | "ur-PK" | "en-IN" | "en-US";

export type SpeechState = "idle" | "listening" | "processing" | "denied" | "error";

export type SpeechError = {
  code: string;
  message: string;
};

type Options = {
  /** Called once a final transcript is available. */
  onFinal?: (text: string) => void;
  /** Called on every interim update. */
  onInterim?: (text: string) => void;
  language?: SpeechLanguage;
};

export function useSpeechRecognition(options: Options = {}) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<SpeechState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<SpeechError | null>(null);
  const [language, setLanguage] = useState<SpeechLanguage>(options.language ?? "en-PK");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const startedAtRef = useRef<number | null>(null);
  const speechEndedAtRef = useRef<number | null>(null);
  const [firstPartialMs, setFirstPartialMs] = useState<number | null>(null);
  const [finalMs, setFinalMs] = useState<number | null>(null);

  const onFinalRef = useRef(options.onFinal);
  const onInterimRef = useRef(options.onInterim);
  onFinalRef.current = options.onFinal;
  onInterimRef.current = options.onInterim;

  useEffect(() => {
    setSupported(getCtor() !== null);
  }, []);

  // Keep the live instance's language in sync.
  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.lang = language;
  }, [language]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
    setFirstPartialMs(null);
    setFinalMs(null);
    finalRef.current = "";
    startedAtRef.current = null;
    speechEndedAtRef.current = null;
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setSupported(false);
      setState("error");
      setError({ code: "unsupported", message: "This browser has no speech recognition." });
      return false;
    }

    // A fresh instance each time avoids the stale-handler bugs that made the
    // old flow unreliable after the first recording.
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    finalRef.current = "";
    setTranscript("");
    setInterim("");
    setError(null);
    setFirstPartialMs(null);
    setFinalMs(null);
    startedAtRef.current = Date.now();
    speechEndedAtRef.current = null;
    setState("listening");

    rec.onstart = () => {
      setState("listening");
    };

    rec.onspeechend = () => {
      speechEndedAtRef.current = Date.now();
    };

    rec.onresult = (event) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const best = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += best;
        else interimText += best;
      }

      if (interimText) {
        if (firstPartialMs === null && startedAtRef.current !== null) {
          setFirstPartialMs(Date.now() - startedAtRef.current);
        }
        setInterim(interimText);
        onInterimRef.current?.(interimText);
      }

      if (finalText) {
        finalRef.current = (finalRef.current + " " + finalText).trim();
        setTranscript(finalRef.current);
        setInterim("");
        if (speechEndedAtRef.current) {
          setFinalMs(Date.now() - speechEndedAtRef.current);
        }
      }
    };

    rec.onerror = (event) => {
      const code = event.error || "error";
      if (code === "not-allowed" || code === "service-not-allowed") {
        setState("denied");
        setError({ code, message: "Microphone permission was denied." });
      } else if (code === "no-speech") {
        setState("idle");
        setError({ code, message: "I didn't hear anything." });
      } else if (code === "aborted") {
        setState("idle");
      } else {
        setState("error");
        setError({ code, message: event.message || "Speech recognition failed." });
      }
    };

    rec.onend = () => {
      recognitionRef.current = null;
      const text = finalRef.current.trim();
      if (text) {
        setState("processing");
        onFinalRef.current?.(text);
      } else {
        setState((prev) => (prev === "denied" || prev === "error" ? prev : "idle"));
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      return true;
    } catch (err) {
      recognitionRef.current = null;
      setState("error");
      setError({ code: "start-failed", message: err instanceof Error ? err.message : "Could not start." });
      return false;
    }
  }, [language, firstPartialMs]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      if (rec) {
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return {
    supported,
    state,
    transcript,
    interim,
    error,
    language,
    setLanguage,
    firstPartialMs,
    finalMs,
    start,
    stop,
    reset,
    setState,
  };
}
