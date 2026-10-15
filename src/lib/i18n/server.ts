/**
 * Server-side translation helper.
 *
 * The frontend uses `useLanguage()` (client-side React context). On the server
 * side (API routes), we don't have React context, so we read the language from
 * a JWT cookie or pass it explicitly.
 *
 * Strategy:
 *   - Default language is "en" (English) — Urdu users will see English in API
 *     responses if we can't detect their language.
 *   - If `lang` is passed explicitly (e.g. via header `X-Lang: ur`), use it.
 *   - For now, the frontend translates display messages via `t()` after the
 *     backend returns a translation key/code in the error.
 *
 * NOTE: For V1, the recommended pattern is:
 *   - Backend throws `new BadRequestError("api.sale.paidExceedsTotal", { paid, total })`
 *     where the message string is the translation KEY (not English text).
 *   - The `fail()` helper in `lib/utils/api.ts` looks up the key in
 *     `translations` and returns the English text by default.
 *   - The frontend's `toast.error()` then RE-TRANSLATES using `t(error.messageKey)`
 *     if the message looks like a translation key.
 *
 * This keeps the backend simple (no DB lookup needed) and lets the frontend
 * translate every error message to whatever language is selected.
 */

import { translations, type Language, type TranslationKey } from "@/lib/i18n/translations";
import { interpolate } from "@/lib/i18n/interpolate";

/**
 * Check if a string is a known translation key.
 */
function isTranslationKey(s: string): s is TranslationKey {
  if (!s || typeof s !== "string") return false;
  if (!s.includes(".") || /\s/.test(s)) return false;
  return Object.prototype.hasOwnProperty.call(translations, s as TranslationKey);
}

/**
 * Resolve a parameter value: if it's a translation key, translate it.
 * Otherwise, return as-is.
 */
function resolveParamValue(
  value: string | number,
  lang: Language,
): string {
  if (typeof value === "number") return String(value);
  if (isTranslationKey(value)) {
    const entry = translations[value];
    return entry[lang] ?? entry.en ?? value;
  }
  return value;
}

/**
 * Translate a key on the server side. Falls back to English.
 *
 * - If `key` is a known translation key, look it up.
 * - Params that are themselves translation keys are recursively resolved
 *   (e.g. `{ resource: "api.resource.customer" }` → "Customer").
 * - {placeholder} tokens in the template are interpolated with params.
 *
 * @param lang - language to translate to (defaults to "en")
 * @param key - translation key (or plain string if not a key)
 * @param params - optional parameters for {placeholder} substitution
 */
export function tServer(
  key: TranslationKey | string,
  params?: Record<string, string | number>,
  lang: Language = "en",
): string {
  // If the key is not a known translation key, return it as-is.
  if (!isTranslationKey(key as string)) {
    return String(key);
  }
  const entry = translations[key as TranslationKey];
  const template = entry[lang] ?? entry.en ?? String(key);
  if (!params) return template;

  // Recursively translate params that are themselves translation keys.
  const resolvedParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    resolvedParams[k] = resolveParamValue(v, lang);
  }
  return interpolate(template, resolvedParams);
}

/**
 * Detect if a string looks like a translation key (e.g. "api.sale.notFound"
 * or "smartentry.error.network"). Used by the frontend to decide whether to
 * re-translate an API error message via t().
 */
export function looksLikeTranslationKey(s: string): boolean {
  return isTranslationKey(s);
}
