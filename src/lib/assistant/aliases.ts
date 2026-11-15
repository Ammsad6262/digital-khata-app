/**
 * Name-alias memory.
 *
 * The speech engine mishears the same names the same way ("daga" for the saved
 * "Daga"). When the owner corrects a plan by picking the real customer/product,
 * we remember the misheard word → the canonical saved name in localStorage and
 * rewrite future transcripts before they are sent. Over a few corrections the
 * assistant stops needing the server model for those names at all.
 *
 * The transformation is pure (`rememberAliasIn` / `applyAliasesWith`) so it is
 * unit-tested without a browser; the exported wrappers persist to localStorage.
 */

const STORAGE_KEY = "digital-khata-name-aliases";
const MAX_ENTRIES = 300;

export type AliasMap = Record<string, string>;

/** Add one mapping to a map, returning a new map. Pure. */
export function rememberAliasIn(map: AliasMap, spoken: string, canonical: string): AliasMap {
  const from = spoken.trim().toLowerCase();
  const to = canonical.trim();
  if (!from || !to) return map;
  if (from === to.toLowerCase()) return map;
  if (from.length > 40 || to.length > 60) return map;
  return { ...map, [from]: to };
}

/** Rewrite whole words/phrases previously corrected by the owner. Pure. */
export function applyAliasesWith(map: AliasMap, input: string): string {
  const entries = Object.entries(map);
  if (entries.length === 0) return input;

  // Replace longer phrases first so "daga cloth" wins over "daga".
  entries.sort((a, b) => b[0].length - a[0].length);

  let text = input;
  for (const [from, to] of entries) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, "giu");
    text = text.replace(re, (_match, prefix: string) => `${prefix}${to}`);
  }
  return text;
}

/** localStorage when available (browser), null during SSR or in tests. */
function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

function read(): AliasMap {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: AliasMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && key && value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function write(map: AliasMap): void {
  const store = storage();
  if (!store) return;
  try {
    const keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
      for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[key];
    }
    store.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full/blocked — aliases are best-effort */
  }
}

/** Remember that `spoken` actually means the saved `canonical` name. */
export function rememberAlias(spoken: string, canonical: string): void {
  write(rememberAliasIn(read(), spoken, canonical));
}

/** Rewrite whole words/phrases that were previously corrected by the owner. */
export function applyAliases(input: string): string {
  return applyAliasesWith(read(), input);
}

/** Number of remembered aliases (for diagnostics/tests). */
export function aliasCount(): number {
  return Object.keys(read()).length;
}

/** Drop every remembered alias. */
export function clearAliases(): void {
  write({});
}