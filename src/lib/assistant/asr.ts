/**
 * ASR transcript correction for the Universal Voice Assistant.
 *
 * Why this exists:
 *   The browser speech engine (Web Speech API) has no shop vocabulary. In a
 *   wholesale app it constantly hears business words as everyday homophones —
 *   "Khalid bought rice" becomes "khalid boat rice" — and the rule engine then
 *   sees no verb, so the command is escalated to the model, which answers
 *   something unrelated. The same happens in reverse for Urdu/Pashto names.
 *
 * What this does:
 *   1. `correctVerbs` repairs high-precision business-word mishearings
 *      ("boat" → "bought", "sole" → "sold", "payed" → "paid"). It needs no
 *      tenant data, so the client runs it before the owner even sends.
 *   2. `correctTranscript` additionally snaps a misheard token to the shop's
 *      real customer / product / supplier / unit name using the existing
 *      cross-script `nameScore` (so "kalid" and "خالد" both become "Khalid"
 *      when that customer exists).
 *
 * Rules:
 *   - Numbers, prices and quantities are never touched.
 *   - A token is only replaced when the match is clearly the best one
 *     (threshold + margin over the runner-up), so "Amir" is never silently
 *     turned into "Umar".
 *   - The original words are returned in `corrections`, so the UI/report can
 *     show exactly what was changed.
 *
 * Pure module: no Prisma, no Next.js, no AI — safe in the browser and easy to
 * unit-test (scripts/test-assistant-asr.ts).
 */

import { nameScore } from "./names";
import { STOPWORDS } from "./nlg";

export type AsrCorrection = {
  from: string;
  to: string;
  kind: "verb" | "name" | "unit";
};

export type AsrContext = {
  customers?: ReadonlyArray<{ name: string }>;
  products?: ReadonlyArray<{ name: string }>;
  suppliers?: ReadonlyArray<{ name: string }>;
  units?: ReadonlyArray<string>;
};

export type CorrectedTranscript = {
  text: string;
  corrections: AsrCorrection[];
};

/**
 * High-precision mishearings for business verbs (and a few nouns the router
 * depends on). Deliberately small: every entry must be safe in a shop command.
 * Everyday words that could themselves be products are intentionally absent.
 */
const WORD_FIXES: Readonly<Record<string, string>> = {
  // English sale/purchase verbs
  boat: "bought",
  bot: "bought",
  bort: "bought",
  bough: "bought",
  sole: "sold",
  sould: "sold",
  soled: "sold",
  payed: "paid",
  pade: "paid",
  recieved: "received",
  reciept: "receipt",
  cartoon: "carton",
  cartoons: "cartons",
  kartoon: "carton",
  kartoons: "cartons",
  // Roman Urdu verbs
  karida: "kharida",
  kareeda: "kharida",
  khareeda: "kharida",
  bechia: "bechi",
  dya: "diya",
  dia: "diya",
};

const TOKEN_CORE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Product homophones the name-scorer misses (it strips vowels, so short pairs
 * like "rise"/"rice" score 0). These are applied ONLY when the target is an
 * actual product in this shop, so "rise" is left alone if the shop has no rice.
 */
const CONTEXT_HOMOPHONES: Readonly<Record<string, string>> = {
  rise: "rice",
  suger: "sugar",
  shugar: "sugar",
  floor: "flour",
  bred: "bread",
  oyl: "oil",
  oill: "oil",
};

function coreOf(token: string): string {
  return token.replace(TOKEN_CORE, "");
}

/** Replace whole-word business mishearings. Needs no tenant context. */
export function correctVerbs(input: string): CorrectedTranscript {
  const corrections: AsrCorrection[] = [];
  if (!input) return { text: input, corrections };

  const text = input.replace(/\S+/g, (raw) => {
    const core = coreOf(raw);
    if (!core) return raw;
    const fixed = WORD_FIXES[core.toLowerCase()];
    if (!fixed || fixed === core.toLowerCase()) return raw;
    const at = raw.indexOf(core);
    corrections.push({ from: core, to: fixed, kind: "verb" });
    return `${raw.slice(0, at)}${fixed}${raw.slice(at + core.length)}`;
  });

  return { text, corrections };
}

type Candidate = { name: string; kind: "customer" | "product" | "supplier" | "unit" };

function buildCandidates(ctx: AsrContext): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (name: string | undefined, kind: Candidate["kind"]) => {
    const value = (name ?? "").trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: value, kind });
  };
  for (const c of ctx.customers ?? []) add(c.name, "customer");
  for (const p of ctx.products ?? []) add(p.name, "product");
  for (const s of ctx.suppliers ?? []) add(s.name, "supplier");
  for (const u of ctx.units ?? []) add(u, "unit");
  return out;
}

/**
 * Fix verbs, then snap misheard tokens to the shop's real names and units.
 * Higher match quality than the router's own matcher is required here because a
 * wrong substitution would silently change what the owner recorded.
 */
export function correctTranscript(input: string, ctx: AsrContext = {}): CorrectedTranscript {
  const base = correctVerbs(input);
  const corrections = [...base.corrections];
  const candidates = buildCandidates(ctx);
  if (candidates.length === 0) return { text: base.text, corrections };

  type Replacement = { start: number; end: number; from: string; to: string; kind: AsrCorrection["kind"] };
  const replacements: Replacement[] = [];

  const tokenRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(base.text))) {
    const raw = m[0]!;
    const core = coreOf(raw);
    if (core.length < 3) continue;
    if (/^\d/.test(core)) continue;
    if (WORD_FIXES[core.toLowerCase()]) continue;

    // Canonicalise an exact (case-insensitive) match first, even for unit
    // words like "carton" that are in STOPWORDS: the owner's saved spelling
    // ("Carton") should win, and this carries no fuzzy-match risk.
    const exact = candidates.find((c) => c.name.toLowerCase() === core.toLowerCase());
    if (exact && exact.name !== core) {
      const exactAt = raw.indexOf(core);
      replacements.push({
        start: m.index + exactAt,
        end: m.index + exactAt + core.length,
        from: core,
        to: exact.name,
        kind: exact.kind === "unit" ? "unit" : "name",
      });
      continue;
    }
    if (STOPWORDS.has(core.toLowerCase())) continue;

    let best = 0;
    let second = 0;
    let chosen: Candidate | null = null;
    for (const candidate of candidates) {
      const score = nameScore(core, candidate.name);
      if (score > best) {
        second = best;
        best = score;
        chosen = candidate;
      } else if (score > second) {
        second = score;
      }
    }

    if (!chosen || best < 80) {
      // Vowel-stripping score misses pairs like "rise"/"rice". Snap only when
      // the shop actually has the product, so we never invent a product.
      const homophone = CONTEXT_HOMOPHONES[core.toLowerCase()];
      const hit = homophone
        ? candidates.find((c) => c.name.toLowerCase() === homophone)
        : undefined;
      if (hit) {
        chosen = hit;
        best = 100;
        second = 0;
      }
    }

    if (!chosen || best < 80) continue;
    // Ambiguous: two different shop names fit almost equally well.
    if (second > 0 && best - second < 8) continue;
    // Already the canonical spelling (only case differs) — still normalise it.
    if (chosen.name === raw) continue;
    if (chosen.name === core) continue;

    const coreAt = raw.indexOf(core);
    replacements.push({
      start: m.index + coreAt,
      end: m.index + coreAt + core.length,
      from: core,
      to: chosen.name,
      kind: chosen.kind === "unit" ? "unit" : "name",
    });
  }

  let text = base.text;
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    text = text.slice(0, r.start) + r.to + text.slice(r.end);
    corrections.push({ from: r.from, to: r.to, kind: r.kind });
  }

  return { text, corrections };
}

/** True when the text carries any correction worth telling the owner about. */
export function hasCorrections(result: CorrectedTranscript): boolean {
  return result.corrections.length > 0;
}
