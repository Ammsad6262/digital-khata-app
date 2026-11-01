/**
 * Small deterministic natural-language helpers.
 *
 * These exist so ordinary commands ("Ali paid me 5,000", "aaj kitna kharch
 * hua?") never need a Gemini request. They are intentionally conservative:
 * when the text is ambiguous the router returns "no match" and the caller
 * falls back to the model.
 */

export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    // Urdu / Arabic-Indic digits → ASCII
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    // strip Arabic diacritics
    .replace(/[\u064B-\u065F\u0670]/g, "")
    // keep letters (incl. Urdu), digits, decimal points and spaces
    .replace(/[^\p{L}\p{N}.:\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
  aik: 1, ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5,
  che: 6, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, dasa: 10,
  gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15,
  solah: 16, satrah: 17, atharah: 18, unnis: 19, unnees: 19,
  // Urdu script
  "ایک": 1, "دو": 2, "تین": 3, "چار": 4, "پانچ": 5, "چھ": 6, "سات": 7,
  "آٹھ": 8, "نو": 9, "دس": 10, "گیارہ": 11, "بارہ": 12, "پندرہ": 15,
  "بیس": 20, "پچیس": 25, "تیس": 30, "چالیس": 40, "پچاس": 50,
  "ساٹھ": 60, "ستر": 70, "اسی": 80, "نوے": 90, "سو": 100, "ہزار": 1000,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  bees: 20, bis: 20, tees: 30, tis: 30, chalees: 40, chalis: 40,
  pachas: 50, pachaas: 50, saath: 60, sath: 60, sattar: 70, assi: 80,
  nawway: 90, nabbe: 90,
};

const MULTIPLIERS: Record<string, number> = {
  hundred: 100, sau: 100, sow: 100,
  thousand: 1000, hazar: 1000, hazaar: 1000, hzar: 1000,
  lakh: 100_000, lac: 100_000, lakhs: 100_000, لاکھ: 100_000,
  crore: 10_000_000, kror: 10_000_000, کروڑ: 10_000_000,
};

export type NumberToken = {
  value: number;
  start: number;
  end: number;
  raw: string;
  /** True when the token was a written number word, not digits. */
  fromWord: boolean;
};

/**
 * Extract every number, including "15 hazar", "1.5 lakh" and "15k".
 */
export function extractNumbers(text: string): NumberToken[] {
  const results: NumberToken[] = [];
  const tokenRe = /\S+/g;
  const tokens: Array<{ token: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    tokens.push({ token: m[0], start: m.index, end: m.index + m[0].length });
  }

  for (let i = 0; i < tokens.length; i++) {
    const { token, start, end } = tokens[i]!;

    // 15k / 1.5k / 15,000
    const compact = token.replace(/,/g, "");
    const kMatch = compact.match(/^(\d+(?:\.\d+)?)k$/);
    if (kMatch) {
      results.push({ value: Number(kMatch[1]) * 1000, start, end, raw: token, fromWord: false });
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(compact)) {
      let value = Number(compact);
      let raw = token;
      let lastEnd = end;
      // "15 hazar" / "2 lakh"
      const next = tokens[i + 1];
      if (next && MULTIPLIERS[next.token] && next.token !== "sau") {
        value *= MULTIPLIERS[next.token]!;
        raw = `${token} ${next.token}`;
        lastEnd = next.end;
        i++;
      } else if (next && (next.token === "hundred" || next.token === "sau")) {
        value *= 100;
        raw = `${token} ${next.token}`;
        lastEnd = next.end;
        i++;
      }
      results.push({ value, start, end: lastEnd, raw, fromWord: false });
      continue;
    }

    if (token in ONES || token in TENS) {
      let value = ONES[token] ?? TENS[token]!;
      let raw = token;
      let lastEnd = end;
      // "twenty five"
      const next = tokens[i + 1];
      if (token in TENS && next && next.token in ONES && ONES[next.token]! < 10) {
        value += ONES[next.token]!;
        raw = `${token} ${next.token}`;
        lastEnd = next.end;
        i++;
      }
      // "5 hazar" style with word number: "pachas hazar"
      const mult = tokens[i + 1];
      if (mult && MULTIPLIERS[mult.token]) {
        value *= MULTIPLIERS[mult.token]!;
        raw += ` ${mult.token}`;
        lastEnd = mult.end;
        i++;
      }
      results.push({ value, start, end: lastEnd, raw, fromWord: true });
    }
  }
  return results;
}

export function parseDateRange(text: string): import("./types").DateRange | undefined {
  if (/\b(today|aaj|aj)\b|آج/.test(text)) return "today";
  if (/\b(yesterday|kal|guzishta kal)\b|کل/.test(text)) return "yesterday";
  if (/\b(this week|is hafte|hafte)\b|اس ہفتے/.test(text)) return "week";
  if (/\b(last month|pichle mahine|guzishta mahina)\b|پچھلے مہینے/.test(text)) return "last_month";
  if (/\b(this month|is mahine|mahine|monthly)\b|اس مہینے/.test(text)) return "month";
  if (/\b(all time|ever|ab tak|total)\b/.test(text)) return "all";
  return undefined;
}

/** "tomorrow" / "kal" / "in 3 days" / "next week" → days from today. */
export function parseRelativeDays(text: string): number | null {
  if (/\b(today|aaj)\b|آج/.test(text)) return 0;
  if (/\b(day after tomorrow|parso|parson)\b/.test(text)) return 2;
  if (/\b(tomorrow|kal)\b|کل/.test(text)) return 1;
  if (/\b(next week|agle hafte)\b/.test(text)) return 7;
  if (/\b(next month|agle mahine)\b/.test(text)) return 30;

  const inDays = text.match(/\b(?:in|after|baad)\s+(\d+)\s*(?:days?|din)\b/);
  if (inDays) return Number(inDays[1]);
  const din = text.match(/\b(\d+)\s*(?:days?|din)\s+(?:baad|later)\b/);
  if (din) return Number(din[1]);
  return null;
}

export type EntityMatch<T> = {
  entity: T;
  name: string;
  start: number;
  end: number;
  exact: boolean;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find entity names inside the text.
 *
 * Strategy:
 *   1. exact (normalized) substring, preferring the longest name;
 *   2. otherwise the first word of the name, if that first word is unique
 *      among the candidate list ("Ali" → "Ali Khan").
 *
 * A match must be at a word boundary. Single-character names are ignored
 * because they produce too many false positives.
 */
export function matchEntities<T extends { name: string }>(
  text: string,
  candidates: T[],
): EntityMatch<T>[] {
  const matches: EntityMatch<T>[] = [];
  const used: Array<[number, number]> = [];

  const overlaps = (s: number, e: number) =>
    used.some(([us, ue]) => s < ue && e > us);

  const sorted = [...candidates].sort((a, b) => b.name.length - a.name.length);

  for (const entity of sorted) {
    const name = normalizeText(entity.name);
    if (name.length < 2) continue;
    const re = new RegExp(`(^|\\s)(${escapeRegExp(name)})(?=\\s|$)`, "g");
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = re.exec(text))) {
      const start = m.index + m[1]!.length;
      const end = start + m[2]!.length;
      if (overlaps(start, end)) continue;
      matches.push({ entity, name: entity.name, start, end, exact: true });
      used.push([start, end]);
      found = true;
      break;
    }
    if (found) continue;
  }

  // Partial: first word of a name, when unique among candidates.
  for (const entity of sorted) {
    const words = normalizeText(entity.name).split(" ").filter(Boolean);
    const first = words[0];
    if (!first || first.length < 3) continue;
    const sameFirst = candidates.filter(
      (c) => normalizeText(c.name).split(" ")[0] === first,
    );
    if (sameFirst.length !== 1) continue;

    const re = new RegExp(`(^|\\s)(${escapeRegExp(first)})(?=\\s|$)`, "g");
    const m = re.exec(text);
    if (!m) continue;
    const start = m.index + m[1]!.length;
    const end = start + m[2]!.length;
    if (overlaps(start, end)) continue;
    matches.push({ entity, name: entity.name, start, end, exact: false });
    used.push([start, end]);
  }

  return matches.sort((a, b) => a.start - b.start);
}

export function removeRanges(text: string, ranges: Array<[number, number]>): string {
  const sorted = [...ranges].sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e] of sorted) {
    out = out.slice(0, s) + " " + out.slice(e);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Words that almost never belong to an entity name in these commands. */
const STOPWORDS = new Set([
  "paid", "pay", "gave", "give", "diye", "diya", "de", "received", "receive",
  "bought", "buy", "purchased", "sold", "sell", "from", "to", "se", "ko", "ne",
  "of", "for", "at", "per", "rate", "total", "amount", "rs", "rupees", "rupay",
  "rupaye", "the", "a", "an", "and", "with", "on", "credit", "udhaar", "cash",
  "another", "more", "remaining", "today", "aaj", "tomorrow", "kal", "add",
  "new", "naya", "nai", "customer", "supplier", "product", "item", "expense",
  "stock", "kg", "kilo", "kilos", "carton", "cartons", "box", "boxes", "bag",
  "bags", "piece", "pieces", "dozen", "litre", "liter", "packet", "packets",
]);

export function meaningfulWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d/.test(w));
}

/** Human-readable money for summaries (server-side, before currency symbol is known). */
export function num(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "0";
  const fixed = Math.round(n * 100) / 100;
  return fixed.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}