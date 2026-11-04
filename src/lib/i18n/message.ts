/**
 * Localise a system-generated message (toast, inline error, assistant error).
 *
 * Messages can arrive in three shapes:
 *   1. A translation key, e.g. "api.sale.notFound"      → translate directly.
 *   2. English text that exactly matches a dictionary
 *      English value, e.g. "Name is required."          → reverse-lookup + translate.
 *   3. Anything else (dynamic text, user data, an
 *      unknown legacy message)                          → return unchanged.
 *
 * This keeps the existing API contract (server sends readable English) while
 * letting the client render the selected language. It is intentionally shared
 * by the toast provider and the Khata Assistant so both behave identically.
 */

import { translations, type TranslationKey } from "./translations";

let reverse: Map<string, TranslationKey> | null = null;

function reverseLookup(): Map<string, TranslationKey> {
  if (reverse) return reverse;
  reverse = new Map();
  for (const key of Object.keys(translations) as TranslationKey[]) {
    const english = translations[key].en;
    // First key wins; duplicate English labels are harmless (same meaning).
    if (!reverse.has(english)) reverse.set(english, key);
  }
  return reverse;
}

/** Conservative key test: dotted, no whitespace, and present in the dictionary. */
export function isTranslationKey(value: string): value is TranslationKey {
  if (!value || typeof value !== "string") return false;
  if (!value.includes(".") || /\s/.test(value)) return false;
  return Object.prototype.hasOwnProperty.call(translations, value);
}

/** Look up the translation key for an English dictionary value, if any. */
export function keyForEnglishMessage(value: string): TranslationKey | null {
  if (!value) return null;
  return reverseLookup().get(value) ?? null;
}

export function localizeMessage(
  message: string,
  t: (key: TranslationKey) => string,
  tParams: (key: TranslationKey, params: Record<string, string | number>) => string,
  params?: Record<string, string | number>,
): string {
  if (!message || typeof message !== "string") return message;

  if (isTranslationKey(message)) {
    return params ? tParams(message, params) : t(message);
  }

  const key = keyForEnglishMessage(message);
  if (key) {
    return params ? tParams(key, params) : t(key);
  }

  return message;
}