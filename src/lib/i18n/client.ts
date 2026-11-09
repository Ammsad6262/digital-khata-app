/**
 * Client-side translation helpers for API errors.
 *
 * The server resolves an error key to English and also returns the original
 * `messageKey` (+ params). The client re-translates with the user's stored
 * language so errors appear in Urdu, not English.
 */

import { translations, type Language, type TranslationKey } from "@/lib/i18n/translations";
import { interpolate } from "@/lib/i18n/interpolate";

export function getStoredLang(): Language {
  if (typeof window === "undefined") return "en";
  try {
    return localStorage.getItem("digital-khata-lang") === "ur" ? "ur" : "en";
  } catch {
    return "en";
  }
}

export function translateKey(
  key: string,
  lang: Language = getStoredLang(),
  params?: Record<string, string | number>,
): string {
  const entry = (translations as Record<string, { en?: string; ur?: string } | undefined>)[key];
  if (!entry) return key;
  const template = (lang === "ur" ? entry.ur : entry.en) ?? entry.en ?? key;
  return params ? interpolate(template, params) : template;
}

type ApiErrorLike = {
  message?: string;
  messageKey?: string;
  translationKey?: boolean;
  params?: Record<string, string | number>;
};

/**
 * Resolve an API error body to a displayable, localized string.
 * Falls back to the server-provided (English) message for legacy errors.
 */
export function resolveApiError(error: ApiErrorLike | undefined | null): string {
  if (!error) return "";
  if (error.messageKey) return translateKey(error.messageKey, getStoredLang(), error.params);
  return error.message ?? "";
}

export function asTranslationKey(key: string): TranslationKey {
  return key as TranslationKey;
}