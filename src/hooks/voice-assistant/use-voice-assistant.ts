"use client";

/**
 * useVoiceAssistant — the client state machine for the Universal Voice
 * Assistant.
 *
 * The voice product is deliberately different from the typed Khata Assistant:
 *
 *   1. The owner taps the mic and speaks.
 *   2. The transcript is shown BEFORE anything is executed, so a misheard word
 *      can be corrected.
 *   3. Only then does the command go to the shared backend engine.
 *   4. Writes still require an explicit confirmation card.
 *
 * No language dropdown. The microphone locale follows the app's UI language,
 * and the language of the actual transcript is detected after recognition.
 */

import { useCallback, useEffect, useState } from "react";
import { useAssistant } from "@/hooks/assistant/use-assistant";
import { useSpeechRecognition } from "@/hooks/assistant/use-speech-recognition";
import { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";
import { useLanguage } from "@/providers/language-provider";
import {
  detectSpeechLanguage,
  defaultSpeechLocale,
  type SpeechLanguage,
  type SpeechLocale,
} from "@/lib/assistant/language";

export function useVoiceAssistant() {
  const { lang } = useLanguage();
  const assistant = useAssistant();
  const recorder = useAudioRecorder();

  const [transcript, setTranscript] = useState("");
  const [detected, setDetected] = useState<SpeechLanguage>("en");

  const speech = useSpeechRecognition({
    language: defaultSpeechLocale(lang),
    onFinal: (text) => {
      const clean = text.trim();
      setTranscript(clean);
      setDetected(detectSpeechLanguage(clean));
    },
  });
  const { setLanguage } = speech;

  // Keep the microphone locale aligned with the app language as it loads.
  useEffect(() => {
    setLanguage(defaultSpeechLocale(lang));
  }, [lang, setLanguage]);

  const listening =
    speech.state === "listening" ||
    recorder.state === "recording" ||
    recorder.state === "requesting";

  const start = useCallback(() => {
    if (assistant.busy) return;
    // A second tap while a session is already live must not create a second
    // recognizer or recorder.
    if (listening) return;
    setTranscript("");
    setDetected(detectSpeechLanguage(""));

    if (speech.supported) {
      speech.start();
      return;
    }

    // No on-device recognition (e.g. Firefox desktop): record and let the
    // server transcribe. This is the only path that costs an AI request.
    void recorder.start((blob, mimeType) => {
      void assistant.send({ audioBlob: blob, audioMimeType: mimeType });
    });
  }, [assistant, listening, recorder, speech]);

  const stop = useCallback(() => {
    if (speech.state === "listening") speech.stop();
    if (recorder.state === "recording") recorder.stop();
    else if (recorder.state === "requesting") recorder.cancel();
  }, [recorder, speech]);

  const cancel = useCallback(() => {
    speech.cancel();
    recorder.cancel();
    setTranscript("");
    setDetected("en");
  }, [recorder, speech]);

  const submit = useCallback(
    (text?: string) => {
      const value = (text ?? transcript).trim();
      if (!value || assistant.busy) return;
      const language = detectSpeechLanguage(value);
      setTranscript("");
      setDetected(language);
      void assistant.send({ text: value, language });
    },
    [assistant, transcript],
  );

  const retry = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || assistant.busy) return;
      void assistant.send({ text: value, language: detectSpeechLanguage(value) });
    },
    [assistant],
  );

  const reset = useCallback(() => {
    assistant.reset();
    speech.reset();
    recorder.reset();
    setTranscript("");
    setDetected("en");
  }, [assistant, recorder, speech]);

  const usingFallbackRecorder =
    recorder.state === "recording" ||
    recorder.state === "requesting" ||
    recorder.state === "stopping";

  return {
    assistant,
    speech,
    recorder,
    transcript,
    setTranscript,
    detected,
    locale: (lang === "ur" ? "ur-PK" : "en-PK") as SpeechLocale,
    listening,
    recordingElapsedMs: usingFallbackRecorder
      ? recorder.elapsedMs
      : speech.elapsedMs,
    recordingRemainingMs: usingFallbackRecorder
      ? recorder.remainingMs
      : speech.remainingMs,
    recordingMaxMs: usingFallbackRecorder
      ? recorder.maxDurationMs
      : speech.maxDurationMs,
    endedReason: speech.endedReason ?? recorder.endedReason,
    restarting: speech.restarting,
    start,
    stop,
    cancel,
    submit,
    retry,
    reset,
  };
}