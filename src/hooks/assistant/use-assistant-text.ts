"use client";

/**
 * useAssistantText — Voice Assistant copy in the selected app language.
 *
 * Reads `useLanguage()` so every Voice Assistant surface re-renders instantly
 * when the owner switches between English and Urdu. The phrase table lives in
 * `src/lib/assistant/phrases.ts`; this hook is only the React binding.
 */

import { useCallback } from "react";
import { useLanguage } from "@/providers/language-provider";
import {
  pickVoice,
  type VoiceLang,
  type VoicePhraseKey,
} from "@/lib/assistant/phrases";

export type AssistantText = {
  lang: VoiceLang;
  vt: (key: VoicePhraseKey, params?: Record<string, string | number>) => string;
};

export function useAssistantText(): AssistantText {
  const { lang } = useLanguage();

  const vt = useCallback(
    (key: VoicePhraseKey, params?: Record<string, string | number>) =>
      pickVoice(lang, key, params),
    [lang],
  );

  return { lang, vt };
}