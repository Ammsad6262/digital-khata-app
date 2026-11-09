/**
 * Spoken-language identification for the Universal Voice Assistant.
 *
 * The owner speaks Urdu, English, Roman Urdu, or a mix, and must never have to
 * pick a language from a dropdown. This module makes that decision from the
 * text the assistant actually received (a transcript, or a typed correction).
 *
 * It is deliberately small and dependency-free so it can run in the browser
 * hook AND on the server without duplicating logic.
 *
 * Honest scope:
 *   - Urdu (Arabic script) is detected reliably from the script itself.
 *   - Roman Urdu is detected from a list of high-signal words. A single
 *     ambiguous word is not enough; we require either two markers or a short
 *     utterance that is mostly Roman Urdu.
 *   - Anything else is treated as English. The server-side AI fallback still
 *     understands Urdu/Roman-Urdu/mixed text regardless of this hint, so a
 *     wrong hint degrades the *reply language*, never the command handling.
 */

export type SpeechLanguage = "en" | "ur" | "ps" | "roman-ur" | "mixed";

/** Locales the browser speech engine understands, chosen automatically. */
export type SpeechLocale = "en-PK" | "ur-PK" | "ps-AF";

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const LATIN_LETTER = /[a-zA-Z]/;

/**
 * Letters and words that exist in Pashto but not Urdu. Pashto and Urdu share
 * most of the Arabic script, so these are the reliable discriminators.
 */
const PASHTO_MARKERS = /[ګځڅښډړږڼېۍ]|واخيستل|واخيست|ورکړل|ورکول|څو|ډېر|لږ|پښتو|وښودل/;

/**
 * High-signal Roman-Urdu words only. English words that Roman Urdu also uses
 * ("add", "customer", "stock", "do") are deliberately excluded so ordinary
 * English is not misread as Roman Urdu.
 */
const ROMAN_URDU_MARKERS = new Set([
  "aaj", "kal", "kitna", "kitne", "kitni", "kitnay",
  "udhaar", "udhar", "udhaari", "bakaya", "baqaya", "hisaab", "hisab", "khata",
  "karo", "kro", "karen", "karde", "karna", "banaya", "banao", "bana", "banado",
  "diya", "diye", "liya", "liye", "wapas", "wapis", "jama", "mang", "mangna",
  "chahiye", "chahiya", "paisa", "paisay", "paise", "rupay", "rupaye", "rupiya",
  "naya", "nai", "dikhao", "dikha", "batao", "bata", "batado", "milao", "mila",
  "zyada", "becha", "bechi", "kharida", "khareeda", "kharidna",
  "chawal", "cheeni", "saman", "maal", "dukan", "dukaan", "kharcha", "kharch",
  "khatam", "dena", "deni", "lena", "leni", "wala", "wali", "wale",
  "nahi", "nahin", "haan", "abhi", "mahina", "mahine", "hafta", "hafte",
  "baje", "phir", "thora", "thoray", "sab", "kuch", "yeh", "ye", "woh", "wo",
  "hai", "hain", "hua", "hui", "hoga", "hogi", "ko", "ne", "ka", "ki", "ke", "se",
]);

/** Identify the language of a command from its text. */
export function detectSpeechLanguage(text: string): SpeechLanguage {
  const value = (text ?? "").trim();
  if (!value) return "en";

  const hasArabic = ARABIC_SCRIPT.test(value);
  const hasLatin = LATIN_LETTER.test(value);
  if (hasArabic && hasLatin) return "mixed";
  if (hasArabic) return PASHTO_MARKERS.test(value) ? "ps" : "ur";

  const words = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "en";

  const markers = words.filter((w) => ROMAN_URDU_MARKERS.has(w)).length;
  if (markers >= 2) return "roman-ur";
  if (markers === 1 && words.length <= 5) return "roman-ur";
  return "en";
}

/** The browser speech-recognition locale that best matches a detected language. */
export function speechLocaleFor(language: SpeechLanguage): SpeechLocale {
  if (language === "ur") return "ur-PK";
  if (language === "ps") return "ps-AF";
  return "en-PK";
}

/**
 * Default microphone locale from the app's UI language, used BEFORE speech has
 * started. No dropdown: an Urdu-interface owner gets Urdu recognition, everyone
 * else gets the Pakistani English/Roman-Urdu locale.
 */
export function defaultSpeechLocale(appLang: "en" | "ur"): SpeechLocale {
  return appLang === "ur" ? "ur-PK" : "en-PK";
}

/**
 * A short, user-facing label for a detected language. This is shown so the owner
 * can see what the assistant understood — it is not developer information.
 */
export function languageLabel(language: SpeechLanguage): string {
  switch (language) {
    case "ur":
      return "اردو";
    case "ps":
      return "پښتو";
    case "roman-ur":
      return "Roman Urdu";
    case "mixed":
      return "Mixed / مکس";
    default:
      return "English";
  }
}
