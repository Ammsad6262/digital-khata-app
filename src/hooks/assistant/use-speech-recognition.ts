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
 * Recording behaviour (Stage 1):
 *   - `continuous = true` so a short pause does not end the session.
 *   - Some browsers still fire `onend` after a pause; we transparently create
 *     a fresh recognizer and keep the words accumulated so far.
 *   - A natural pause is tolerated for `silenceGraceMs` (4 s by default).
 *   - A hard `maxDurationMs` (60 s) limit protects the browser and the owner.
 *   - The owner can stop manually at any time, or cancel and discard.
 *
 * Accuracy:
 *   - every result can carry several alternatives; we take the
 *     highest-confidence one instead of blindly trusting alternative 0,
 *   - the caller receives `confidence` / `lowConfidence` so it can ask the
 *     owner to check the words before a financial action runs.
 *
 * It also exposes timing so we can measure recognition speed honestly:
 *   - `startedAt`     : when listening began
 *   - `firstPartialMs`: time to the first interim word
 *   - `finalMs`       : time from speech end to the final transcript
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAssistantText } from "@/hooks/assistant/use-assistant-text";
import {
  resolveRecordingConfig,
  type RecordingConfig,
} from "@/lib/voice/recording-config";

type SpeechAlternativeLike = { transcript: string; confidence: number };

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternativeLike;
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
  onspeechstart: (() => void) | null;
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

/** Pick the most confident alternative in a result (falls back to index 0). */
function bestAlternative(result: SpeechRecognitionResultLike): SpeechAlternativeLike {
  let best = result[0];
  if (!best) return { transcript: "", confidence: 0 };
  for (let i = 1; i < result.length; i++) {
    const candidate = result[i];
    if (candidate && candidate.confidence > best.confidence) best = candidate;
  }
  return best;
}

/** Remove every handler before aborting so an old recognizer cannot re-enter. */
function detachHandlers(rec: SpeechRecognitionLike) {
  rec.onstart = null;
  rec.onresult = null;
  rec.onerror = null;
  rec.onend = null;
  rec.onspeechend = null;
  rec.onspeechstart = null;
  rec.onaudiostart = null;
}

function safeAbort(rec: SpeechRecognitionLike | null) {
  if (!rec) return;
  try {
    rec.abort();
  } catch {
    /* already stopped */
  }
}

export type SpeechLanguage = "en-PK" | "ur-PK" | "en-IN" | "en-US";

export type SpeechState = "idle" | "listening" | "processing" | "denied" | "error";

export type SpeechEndReason =
  | "manual"
  | "silence"
  | "max-duration"
  | "error"
  | "restart-exhausted";

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
  /** Tests pass shorter limits; the product uses RECORDING_DEFAULTS. */
  config?: Partial<RecordingConfig>;
};

export function useSpeechRecognition(options: Options = {}) {
  const { lang, vt } = useAssistantText();
  const config = useMemo(
    () => resolveRecordingConfig(options.config),
    [options.config],
  );

  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<SpeechState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<SpeechError | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [language, setLanguage] = useState<SpeechLanguage>(options.language ?? "en-PK");
  const [endedReason, setEndedReason] = useState<SpeechEndReason | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [restarting, setRestarting] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const confidenceRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const speechEndedAtRef = useRef<number | null>(null);
  const firstPartialRef = useRef<number | null>(null);
  const [firstPartialMs, setFirstPartialMs] = useState<number | null>(null);
  const [finalMs, setFinalMs] = useState<number | null>(null);

  /** Session token: every handler checks it so an old recognizer is inert. */
  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const userStoppedRef = useRef(false);
  const cancelledRef = useRef(false);
  const finalizedRef = useRef(false);
  const restartCountRef = useRef(0);
  const hasSpeechRef = useRef(false);

  const maxTimerRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const noSpeechTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const stopFallbackRef = useRef<number | null>(null);

  const onFinalRef = useRef(options.onFinal);
  const onInterimRef = useRef(options.onInterim);
  onFinalRef.current = options.onFinal;
  onInterimRef.current = options.onInterim;

  const configRef = useRef(config);
  configRef.current = config;
  const vtRef = useRef(vt);
  vtRef.current = vt;
  const languageRef = useRef(language);
  languageRef.current = language;

  // These refs break the finalize → restart → finalize callback cycle.
  const finalizeRef = useRef<(reason: SpeechEndReason) => void>(() => {});
  const failRef = useRef<(code: string, message: string, state?: SpeechState) => void>(
    () => {},
  );
  const createAndStartRef = useRef<() => void>(() => {});
  const scheduleRestartRef = useRef<() => void>(() => {});

  useEffect(() => {
    setSupported(getCtor() !== null);
  }, []);

  // Keep the live instance's language in sync.
  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.lang = language;
  }, [language]);

  const clearTimer = useCallback((ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    clearTimer(maxTimerRef);
    clearTimer(silenceTimerRef);
    clearTimer(noSpeechTimerRef);
    clearTimer(restartTimerRef);
    clearTimer(stopFallbackRef);
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, [clearTimer]);

  const clearNoSpeechTimer = useCallback(() => {
    clearTimer(noSpeechTimerRef);
  }, [clearTimer]);

  const startSilenceTimer = useCallback(() => {
    if (!activeRef.current || userStoppedRef.current || finalizedRef.current) return;
    clearTimer(silenceTimerRef);
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      if (!activeRef.current || userStoppedRef.current || finalizedRef.current) return;
      finalizeRef.current("silence");
    }, configRef.current.silenceGraceMs);
  }, [clearTimer]);

  const finalize = useCallback(
    (reason: SpeechEndReason) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      activeRef.current = false;
      clearTimers();

      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        detachHandlers(rec);
        safeAbort(rec);
      }

      const text = [finalRef.current.trim(), interimRef.current.trim()]
        .filter(Boolean)
        .join(" ")
        .trim();
      finalRef.current = text;
      interimRef.current = "";

      if (startedAtRef.current !== null) {
        setElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
      }
      if (speechEndedAtRef.current !== null) {
        setFinalMs(Math.max(0, Date.now() - speechEndedAtRef.current));
      }

      setEndedReason(reason);
      setRestarting(false);

      if (text) {
        setTranscript(text);
        setInterim("");
        setState("processing");
        setConfidence(confidenceRef.current);
        onFinalRef.current?.(text);
        return;
      }

      setInterim("");
      if (reason === "error" || reason === "restart-exhausted") {
        setState("error");
      } else {
        setState("idle");
      }
      if (reason === "max-duration" || reason === "silence") {
        setError({ code: "no-speech", message: vtRef.current("heardNothing") });
      }
    },
    [clearTimers],
  );
  finalizeRef.current = finalize;

  const fail = useCallback(
    (code: string, message: string, nextState: SpeechState = "error") => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      activeRef.current = false;
      clearTimers();

      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        detachHandlers(rec);
        safeAbort(rec);
      }

      setState(nextState);
      setError({ code, message });
      setEndedReason("error");
      setRestarting(false);
      setInterim("");
      if (startedAtRef.current !== null) {
        setElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
      }
    },
    [clearTimers],
  );
  failRef.current = fail;

  const scheduleRestart = useCallback(() => {
    if (
      !activeRef.current ||
      userStoppedRef.current ||
      cancelledRef.current ||
      finalizedRef.current
    ) {
      return;
    }

    const cfg = configRef.current;
    if (restartCountRef.current >= cfg.maxRestarts) {
      if (finalRef.current.trim() || interimRef.current.trim()) {
        finalizeRef.current("restart-exhausted");
      } else {
        failRef.current("restart-exhausted", vtRef.current("heardNothing"), "idle");
      }
      return;
    }

    if (restartTimerRef.current !== null) return;
    restartCountRef.current += 1;

    // If nobody has spoken yet, back off gently; the no-speech timer will
    // explain the situation. Once speech has started, restart promptly so a
    // second sentence is not clipped.
    const delay = hasSpeechRef.current
      ? cfg.restartDelayMs
      : Math.min(1_000, cfg.restartDelayMs + restartCountRef.current * 100);

    setRestarting(true);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (
        !activeRef.current ||
        userStoppedRef.current ||
        cancelledRef.current ||
        finalizedRef.current
      ) {
        return;
      }
      createAndStartRef.current();
    }, delay);
  }, []);
  scheduleRestartRef.current = scheduleRestart;

  const createAndStart = useCallback(() => {
    if (
      !activeRef.current ||
      userStoppedRef.current ||
      cancelledRef.current ||
      finalizedRef.current
    ) {
      return;
    }

    const Ctor = getCtor();
    if (!Ctor) {
      setSupported(false);
      failRef.current("unsupported", vtRef.current("speechUnsupported"), "error");
      return;
    }

    // Drop the previous (ended) recognizer before replacing it.
    const previous = recognitionRef.current;
    if (previous) {
      detachHandlers(previous);
      safeAbort(previous);
    }

    const session = sessionRef.current;
    const rec = new Ctor();
    rec.lang = languageRef.current;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      if (session !== sessionRef.current) return;
      if (finalizedRef.current) return;
      setState("listening");
      setRestarting(false);
    };

    rec.onspeechstart = () => {
      if (session !== sessionRef.current) return;
      hasSpeechRef.current = true;
      clearNoSpeechTimer();
      clearTimer(silenceTimerRef);
    };

    rec.onspeechend = () => {
      if (session !== sessionRef.current) return;
      speechEndedAtRef.current = Date.now();
      startSilenceTimer();
    };

    rec.onresult = (event) => {
      if (
        session !== sessionRef.current ||
        !activeRef.current ||
        finalizedRef.current
      ) {
        return;
      }

      hasSpeechRef.current = true;
      clearNoSpeechTimer();
      clearTimer(silenceTimerRef);

      let interimText = "";
      let finalText = "";
      let finalConfidence: number | null = null;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const best = bestAlternative(result);
        if (result.isFinal) {
          finalText += best.transcript;
          if (best.confidence > (finalConfidence ?? 0)) finalConfidence = best.confidence;
        } else {
          interimText += best.transcript;
        }
      }

      if (interimText) {
        interimRef.current = interimText;
        if (firstPartialRef.current === null && startedAtRef.current !== null) {
          firstPartialRef.current = Date.now() - startedAtRef.current;
          setFirstPartialMs(firstPartialRef.current);
        }
        setInterim(interimText);
        onInterimRef.current?.(interimText);
      }

      if (finalText) {
        finalRef.current = (finalRef.current + " " + finalText).trim();
        interimRef.current = "";
        setTranscript(finalRef.current);
        setInterim("");
        if (finalConfidence !== null) {
          confidenceRef.current = finalConfidence;
          setConfidence(finalConfidence);
        }
        if (speechEndedAtRef.current) {
          setFinalMs(Date.now() - speechEndedAtRef.current);
        }
      }
    };

    rec.onerror = (event) => {
      if (session !== sessionRef.current || finalizedRef.current) return;
      const code = event.error || "error";

      if (code === "not-allowed" || code === "service-not-allowed") {
        failRef.current(code, vtRef.current("microphoneDenied"), "denied");
        return;
      }

      if (code === "no-speech") {
        if (finalRef.current.trim() || interimRef.current.trim()) {
          // We already have words; treat it as a pause, not a failure.
          startSilenceTimer();
          return;
        }
        failRef.current(code, vtRef.current("heardNothing"), "idle");
        return;
      }

      if (code === "aborted") {
        if (userStoppedRef.current) finalizeRef.current("manual");
        else if (activeRef.current) scheduleRestartRef.current();
        return;
      }

      if (code === "network" && restartCountRef.current < configRef.current.maxRestarts) {
        scheduleRestartRef.current();
        return;
      }

      if (finalRef.current.trim() || interimRef.current.trim()) {
        finalizeRef.current("error");
      } else {
        failRef.current(code, vtRef.current("speechFailed"), "error");
      }
    };

    rec.onend = () => {
      if (session !== sessionRef.current) return;
      if (finalizedRef.current || cancelledRef.current) return;

      if (userStoppedRef.current) {
        finalizeRef.current("manual");
        return;
      }
      if (!activeRef.current) return;

      // A browser that ignores `continuous` ends after every utterance.
      // Start the pause clock and transparently create a new recognizer.
      const text = (finalRef.current || interimRef.current).trim();
      if (text && silenceTimerRef.current === null) startSilenceTimer();
      scheduleRestartRef.current();
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setState("listening");
    } catch {
      if (recognitionRef.current === rec) recognitionRef.current = null;
      detachHandlers(rec);
      safeAbort(rec);
      if (restartCountRef.current < configRef.current.maxRestarts) {
        scheduleRestartRef.current();
      } else {
        failRef.current("start-failed", vtRef.current("couldNotStart"), "error");
      }
    }
  }, [clearNoSpeechTimer, clearTimer, startSilenceTimer]);
  createAndStartRef.current = createAndStart;

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setSupported(false);
      setState("error");
      setError({ code: "unsupported", message: vtRef.current("speechUnsupported") });
      return false;
    }

    // Repeated taps must not create two live recognizers.
    if (activeRef.current) return true;

    sessionRef.current += 1;
    activeRef.current = true;
    userStoppedRef.current = false;
    cancelledRef.current = false;
    finalizedRef.current = false;
    restartCountRef.current = 0;
    hasSpeechRef.current = false;

    finalRef.current = "";
    interimRef.current = "";
    confidenceRef.current = null;
    startedAtRef.current = Date.now();
    speechEndedAtRef.current = null;
    firstPartialRef.current = null;

    setTranscript("");
    setInterim("");
    setError(null);
    setConfidence(null);
    setFirstPartialMs(null);
    setFinalMs(null);
    setEndedReason(null);
    setElapsedMs(0);
    setRestarting(false);
    setState("listening");

    const session = sessionRef.current;
    const cfg = configRef.current;

    maxTimerRef.current = window.setTimeout(() => {
      if (session !== sessionRef.current) return;
      if (!activeRef.current || finalizedRef.current) return;
      finalizeRef.current("max-duration");
    }, cfg.maxDurationMs);

    elapsedTimerRef.current = window.setInterval(() => {
      if (session !== sessionRef.current || !activeRef.current) return;
      if (startedAtRef.current !== null) {
        setElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
      }
    }, 250);

    noSpeechTimerRef.current = window.setTimeout(() => {
      if (session !== sessionRef.current) return;
      if (!activeRef.current || finalizedRef.current) return;
      if (finalRef.current.trim() || interimRef.current.trim()) return;
      failRef.current("no-speech", vtRef.current("heardNothing"), "idle");
    }, cfg.noSpeechTimeoutMs);

    createAndStartRef.current();
    return true;
  }, []);

  const stop = useCallback(() => {
    if (finalizedRef.current) return;
    userStoppedRef.current = true;
    clearTimers();
    setRestarting(false);

    const text = (finalRef.current || interimRef.current).trim();
    if (text) setState("processing");

    const rec = recognitionRef.current;
    if (!rec) {
      finalizeRef.current("manual");
      return;
    }

    // Some browsers never fire onend after stop(); finalize anyway so the
    // owner is never stuck on a red microphone.
    stopFallbackRef.current = window.setTimeout(() => {
      stopFallbackRef.current = null;
      if (!finalizedRef.current) finalizeRef.current("manual");
    }, 1_500);

    try {
      rec.stop();
    } catch {
      finalizeRef.current("manual");
    }
  }, [clearTimers]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    userStoppedRef.current = true;
    activeRef.current = false;
    finalizedRef.current = true;
    sessionRef.current += 1;
    clearTimers();

    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      detachHandlers(rec);
      safeAbort(rec);
    }

    finalRef.current = "";
    interimRef.current = "";
    confidenceRef.current = null;
    startedAtRef.current = null;
    speechEndedAtRef.current = null;
    firstPartialRef.current = null;

    setTranscript("");
    setInterim("");
    setError(null);
    setConfidence(null);
    setFirstPartialMs(null);
    setFinalMs(null);
    setEndedReason(null);
    setElapsedMs(0);
    setRestarting(false);
    setState("idle");
  }, [clearTimers]);

  const reset = useCallback(() => {
    cancel();
  }, [cancel]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      activeRef.current = false;
      finalizedRef.current = true;
      clearTimers();
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        detachHandlers(rec);
        safeAbort(rec);
      }
    };
  }, [clearTimers]);

  return {
    supported,
    state,
    transcript,
    interim,
    error,
    confidence,
    /**
     * Browser confidence is often 0 even for a correct transcript, so only flag
     * a genuinely low non-zero score. The UI always lets the owner review the
     * words anyway; this is an extra nudge.
     */
    lowConfidence: confidence !== null && confidence > 0 && confidence < 0.55,
    language,
    setLanguage,
    firstPartialMs,
    finalMs,
    /** Why the last session ended (manual, pause, limit, error). */
    endedReason,
    /** Live timer for the recording UI. */
    elapsedMs,
    remainingMs: Math.max(0, config.maxDurationMs - elapsedMs),
    maxDurationMs: config.maxDurationMs,
    restarting,
    start,
    stop,
    cancel,
    reset,
    setState,
  };
}