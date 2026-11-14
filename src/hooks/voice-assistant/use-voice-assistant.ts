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
 * Multilingual input:
 *   - English / Urdu use the browser's on-device recogniser (fast + free) with
 *     `en-PK` / `ur-PK`.
 *   - Pashto has no reliable browser recogniser, so the audio is recorded and
 *     transcribed+understood by the server model (`ps-AF` is attempted first,
 *     and we fall back automatically if the browser rejects it).
 *   - The mic starts in the app's UI language. The owner can switch explicitly
 *     with the language chips; there is no "Auto" button.
 */

import { useCallback, useEffect, useState } from "react";
import { useAssistant } from "@/hooks/assistant/use-assistant";
import { useSpeechRecognition } from "@/hooks/assistant/use-speech-recognition";
import { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";
import { useLanguage } from "@/providers/language-provider";
import { correctVerbs } from "@/lib/assistant/asr";
import {
  detectSpeechLanguage,
  defaultSpeechLocale,
  type SpeechLanguage,
  type SpeechLocale,
} from "@/lib/assistant/language";

/** Language the owner wants to speak. "auto" follows the app UI language. */
export type VoiceLanguageMode = "auto" | "en" | "ur" | "ps";

function localeForMode(mode: VoiceLanguageMode, appLang: "en" | "ur"): SpeechLocale {
  if (mode === "en") return "en-PK";
  if (mode === "ur") return "ur-PK";
  if (mode === "ps") return "ps-AF";
  return defaultSpeechLocale(appLang);
}

function hintForMode(mode: VoiceLanguageMode, text: string): SpeechLanguage {
  if (mode === "en") return "en";
  if (mode === "ur") return "ur";
  if (mode === "ps") return "ps";
  return detectSpeechLanguage(text);
}

export function useVoiceAssistant() {
  const { lang } = useLanguage();
  const assistant = useAssistant();
  const recorder = useAudioRecorder();

  const [transcript, setTranscript] = useState("");
  const [detected, setDetected] = useState<SpeechLanguage>("en");
  // No "auto" chip: the mic starts in the app's language and the owner can
  // switch to English / Urdu / Pashto explicitly. This removes the confusing
  // "Auto" button while keeping the same default behaviour.
  const [languageMode, setLanguageMode] = useState<VoiceLanguageMode>(lang === "ur" ? "ur" : "en");

  const serverTranscribe = useCallback(
    (language?: SpeechLanguage) => {
      void recorder.start((blob, mimeType) => {
        void assistant.send({ audioBlob: blob, audioMimeType: mimeType, language });
      });
    },
    [assistant, recorder],
  );

  const speech = useSpeechRecognition({
    language: localeForMode(languageMode, lang),
    onFinal: (text) => {
      // Repair business-word mishearings before the owner reviews the text, so
      // "khalid boat" is shown as "khalid bought" instead of being sent wrong.
      const clean = correctVerbs(text.trim()).text;
      setTranscript(clean);
      setDetected(hintForMode(languageMode, clean));
    },
    onUnsupported: () => {
      // The browser cannot recognise this language (e.g. Pashto). Record the
      // audio and let the server model transcribe and understand it instead.
      serverTranscribe(languageMode === "auto" ? undefined : (languageMode as SpeechLanguage));
    },
  });
  const { setLanguage } = speech;

  // Keep the microphone locale aligned with the chosen mode + app language.
  useEffect(() => {
    setLanguage(localeForMode(languageMode, lang));
  }, [lang, languageMode, setLanguage]);

  const listening = speech.state === "listening" || recorder.state === "recording";

  const start = useCallback(() => {
    if (assistant.busy) return;
    setTranscript("");
    setDetected(detectSpeechLanguage(""));

    // Pashto: no reliable browser recogniser — always use the server model.
    if (languageMode === "ps") {
      serverTranscribe("ps");
      return;
    }

    if (speech.supported) {
      speech.start();
      return;
    }

    // No on-device recognition (e.g. Firefox desktop): record and let the
    // server transcribe. This is the only path that costs an AI request.
    serverTranscribe(languageMode === "auto" ? undefined : (languageMode as SpeechLanguage));
  }, [assistant.busy, languageMode, serverTranscribe, speech]);

  const stop = useCallback(() => {
    if (speech.state === "listening") speech.stop();
    if (recorder.state === "recording") recorder.stop();
  }, [recorder, speech]);

  const submit = useCallback(
    (text?: string) => {
      const value = (text ?? transcript).trim();
      if (!value || assistant.busy) return;
      const language = hintForMode(languageMode, value);
      setTranscript("");
      setDetected(language);
      void assistant.send({ text: value, language });
    },
    [assistant, languageMode, transcript],
  );

  const retry = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || assistant.busy) return;
      void assistant.send({ text: value, language: hintForMode(languageMode, value) });
    },
    [assistant, languageMode],
  );

  const reset = useCallback(() => {
    assistant.reset();
    speech.reset();
    recorder.reset();
    setTranscript("");
    setDetected("en");
  }, [assistant, recorder, speech]);

  return {
    assistant,
    speech,
    recorder,
    transcript,
    setTranscript,
    detected,
    languageMode,
    setLanguageMode,
    locale: localeForMode(languageMode, lang),
    listening,
    start,
    stop,
    submit,
    retry,
    reset,
  };
}
