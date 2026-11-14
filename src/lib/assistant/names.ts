/**
 * Cross-script name matching.
 *
 * A shopkeeper may have a customer saved as "Ahmed" (Latin) while the voice
 * transcript says "احمد" (Urdu) — or the other way round. A plain
 * `name contains ?` SQL match can never join those two, which is why the
 * confirmation card used to say "No customer named احمد yet" for a customer
 * that plainly exists.
 *
 * This module is deliberately pure (no Prisma, no Next.js) so it can be
 * unit-tested directly. It provides:
 *   - `foldName`      — case/space/diacritic-insensitive form,
 *   - `latinizeName`  — Arabic/Urdu letters transliterated to Latin,
 *   - `nameScore`     — 0..100 similarity between two names,
 *   - `namesMatch`    — `nameScore(a, b) >= 70` convenience.
 *
 * The scoring is intentionally conservative: it favours exact and
 * transliteration-equal names, and only allows small edits for longer names.
 */

// Arabic/Urdu letters → Latin. Vowels are approximate; the consonant key
// below removes them anyway, so only the consonants have to be stable.
const ARABIC_TO_LATIN: Record<string, string> = {
  ا: "a", آ: "a", أ: "a", إ: "a", ٱ: "a",
  ب: "b", پ: "p", ت: "t", ٹ: "t", ث: "s",
  ج: "j", چ: "ch", ح: "h", خ: "kh",
  د: "d", ڈ: "d", ذ: "z", ر: "r", ڑ: "r", ز: "z", ژ: "zh",
  س: "s", ش: "sh", ص: "s", ض: "z", ط: "t", ظ: "z",
  ع: "a", غ: "gh", ف: "f", ق: "q", ک: "k", ك: "k", گ: "g",
  ل: "l", م: "m", ن: "n", ں: "n", ه: "h", ہ: "h", ھ: "h", ة: "h",
  و: "w", ؤ: "w", ی: "i", ي: "i", ے: "y", ئ: "i", ء: "", ۃ: "h",
  // Pashto additions — same names are often saved in Pashto script.
  ټ: "t", ډ: "d", ړ: "r", ږ: "z", ښ: "sh", ګ: "g", ڼ: "n",
  ې: "e", ۍ: "i", ۀ: "h",
};

function stripDiacritics(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064b-\u0652\u0670\u0640]/g, "");
}

/** Case/space/diacritic-insensitive form with Arabic variants unified. */
export function foldName(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىي]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ہھ]/g, "ه")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Transliterate Arabic/Urdu to Latin; Latin characters pass through. */
export function latinizeName(input: string): string {
  let out = "";
  for (const ch of stripDiacritics(input).toLowerCase()) {
    out += ARABIC_TO_LATIN[ch] ?? ch;
  }
  return out;
}

/** Squashed Latin form with i/y unified and non-alphanumerics removed. */
function fullKey(input: string): string {
  return latinizeName(input)
    .replace(/y/g, "i")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Consonant skeleton: vowels removed and doubled letters collapsed, so
 * "Muhammad" and "محمد" both become "mhmd".
 */
function consonantKey(input: string): string {
  return fullKey(input)
    .replace(/[aeiou]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    prev = curr;
  }
  return prev[b.length] ?? Math.max(a.length, b.length);
}

function hasArabic(input: string): boolean {
  return /[\u0600-\u06ff]/.test(input);
}

function coreScore(a: string, b: string): number {
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) return 0;
  if (fa === fb) return 100;

  const ka = fullKey(a);
  const kb = fullKey(b);
  if (ka && ka === kb) return 96;

  const ca = consonantKey(a);
  const cb = consonantKey(b);
  if (ca.length >= 3 && ca === cb) return 92;
  // Short names keep only two consonants ("بلال"→"bl", "عمر"→"mr"). Allow
  // those only across scripts, so two different Latin names ("Amir"/"Umar")
  // are never merged.
  if (ca.length >= 2 && ca === cb && hasArabic(a) !== hasArabic(b)) return 90;

  // Same-script spelling variants: "Bilal"/"Belal", "Umar"/"Omar".
  if (!hasArabic(a) && !hasArabic(b) && Math.min(ka.length, kb.length) >= 4) {
    if (levenshtein(ka, kb) <= 1) return 90;
  }

  if (ca.length >= 3 && cb.length >= 3) {
    if (ca.startsWith(cb) || cb.startsWith(ca)) return 82;
    const min = Math.min(ca.length, cb.length);
    const dist = levenshtein(ca, cb);
    // One letter of difference across scripts is a transliteration variant
    // ("Warji" ↔ "ورگی"), not a different person.
    if (hasArabic(a) !== hasArabic(b) && dist <= 1) return 80;
    if (min >= 5 && dist <= 1) return 78;
    if (min >= 7 && dist <= 2) return 70;
  }
  return 0;
}

/** 0..100 similarity. 0 means "not the same name". */
export function nameScore(a: string, b: string): number {
  const direct = coreScore(a, b);
  if (direct > 0) return direct;

  // One name a single token, the other multi-word ("Ahmed" vs "Ahmed Khan").
  const aTokens = foldName(a).split(" ").filter(Boolean);
  const bTokens = foldName(b).split(" ").filter(Boolean);
  if (aTokens.length === 1 && bTokens.length > 1) {
    for (const token of bTokens) {
      const s = coreScore(a, token);
      if (s >= 92) return 86;
    }
  }
  if (bTokens.length === 1 && aTokens.length > 1) {
    for (const token of aTokens) {
      const s = coreScore(token, b);
      if (s >= 92) return 86;
    }
  }
  return 0;
}

/** True when two names plausibly refer to the same person/product. */
export function namesMatch(a: string, b: string): boolean {
  return nameScore(a, b) >= 70;
}
