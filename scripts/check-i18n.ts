/**
 * i18n audit — reports translation coverage and quality risks.
 *
 * Checks:
 *   1. Keys missing an `ur` value.
 *   2. `ur` identical to `en` (likely untranslated).
 *   3. `ur` containing Latin letters outside placeholders (likely untranslated).
 *
 * Usage: npx tsx scripts/check-i18n.ts
 */

import { translations, type TranslationKey } from "../src/lib/i18n/translations";

const keys = Object.keys(translations) as TranslationKey[];

const missing: string[] = [];
const identical: string[] = [];
const latin: string[] = [];

const stripPlaceholders = (s: string) => s.replace(/\{[^}]*\}/g, "");

for (const key of keys) {
  const entry = translations[key];
  const en: string = entry?.en ?? "";
  const ur: string = entry?.ur ?? "";

  if (ur === "") {
    missing.push(key);
    continue;
  }
  if (ur === en && /[A-Za-z]/.test(en)) {
    identical.push(key);
    continue;
  }
  const bare = stripPlaceholders(ur).replace(/[\s\u200c\u200f\u200e\d\p{P}\p{S}]/gu, "");
  if (/[A-Za-z]/.test(bare)) {
    latin.push(`${key}  →  ${JSON.stringify(ur)}`);
  }
}

console.log(`Total keys:        ${keys.length}`);
console.log(`Missing ur:        ${missing.length}`);
console.log(`ur === en:         ${identical.length}`);
console.log(`ur contains Latin: ${latin.length}`);

if (missing.length) console.log(`\nMissing:\n  ${missing.join("\n  ")}`);
if (identical.length) console.log(`\nIdentical to en:\n  ${identical.join("\n  ")}`);
if (latin.length) console.log(`\nLatin inside ur (sample):\n  ${latin.slice(0, 60).join("\n  ")}`);

if (!missing.length && !identical.length && !latin.length) {
  console.log("\nAll keys fully translated.");
}
