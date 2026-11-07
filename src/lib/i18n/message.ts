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
import { ApiError } from "@/lib/utils/api-client";

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

/** Resolve params that are themselves translation keys (e.g. {resource}). */
function resolveParamKeys(
  params: Record<string, string | number> | undefined,
  t: (key: TranslationKey) => string,
): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const resolved: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    resolved[key] =
      typeof value === "string" && isTranslationKey(value) ? t(value) : value;
  }
  return resolved;
}

/**
 * Turn any thrown value into a clear, localized message that is safe to show
 * to an ordinary shopkeeper.
 *
 * - `ApiError` → re-translates the original key (so parameterised financial
 *   messages work in Urdu) or the English message.
 * - Network/timeout errors → friendly message from the client wrapper.
 * - Anything else (an unexpected runtime error) → the caller's friendly
 *   fallback. Raw technical text is never surfaced.
 */
export function userMessage(
  error: unknown,
  t: (key: TranslationKey) => string,
  tParams: (key: TranslationKey, params: Record<string, string | number>) => string,
  fallbackKey: TranslationKey = "common.failed",
): string {
  if (error instanceof ApiError) {
    const params = resolveParamKeys(error.params, t);
    if (
      error.translationKey &&
      error.messageKey &&
      isTranslationKey(error.messageKey)
    ) {
      return params
        ? tParams(error.messageKey, params)
        : t(error.messageKey);
    }
    if (error.message && error.message.trim()) {
      return localizeMessage(error.message, t, tParams, params);
    }
    return t(fallbackKey);
  }
  return t(fallbackKey);
}
