/**
 * i18n key-usage audit.
 *
 * TypeScript guarantees every *typed* t() key exists. This catches the ones
 * that escape the type system via `as never` / `as any` or object constants:
 *   - literal keys in t() / tParams() / tServer()
 *   - string properties like labelKey/titleKey/descKey/key/actionKey
 *   - template keys like t(`growth.priority.${x}`) — checks the prefix exists
 *
 * Usage: node scripts/audit-i18n-keys.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const translations = readFileSync("src/lib/i18n/translations.ts", "utf8");
const defined = new Set();
for (const m of translations.matchAll(/^\s*"([^"]+)"\s*:\s*\{\s*en:/gm)) defined.add(m[1]);
const namespaces = new Set([...defined].map((k) => k.split(".")[0]));

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
})("src");

const looksLikeKey = (s) => s.includes(".") && namespaces.has(s.split(".")[0]);

const missing = [];
const prefixes = new Set();

for (const f of files) {
  if (f.endsWith("translations.ts")) continue;
  const src = readFileSync(f, "utf8");

  // 1. literal keys inside t(), tParams(), tServer()
  for (const m of src.matchAll(/\b(?:t|tParams|tServer)\(\s*"([^"]+)"/g)) {
    if (looksLikeKey(m[1]) && !defined.has(m[1])) missing.push(`${f}: t("${m[1]}")`);
  }

  // 2. object properties named *Key / key with a string literal
  for (const m of src.matchAll(/\b([A-Za-z]*[Kk]ey)\s*:\s*"([^"]+)"/g)) {
    if (looksLikeKey(m[2]) && !defined.has(m[2])) missing.push(`${f}: ${m[1]}: "${m[2]}"`);
  }

  // 3. template keys t(`prefix.${...}`) — check the static prefix exists
  for (const m of src.matchAll(/\b(?:t|tParams)\(\s*`([^`$]*)\$\{/g)) {
    const prefix = m[1];
    if (prefix.includes(".")) prefixes.add(prefix);
  }
}

for (const prefix of prefixes) {
  const ok = [...defined].some((k) => k.startsWith(prefix));
  if (!ok) missing.push(`template prefix has no keys: "${prefix}"`);
}

console.log(`Translation keys defined: ${defined.size}`);
console.log(`Template prefixes checked: ${prefixes.size}`);
console.log(`Unknown key usages: ${missing.length}`);
if (missing.length) {
  console.log("\nMissing:");
  for (const m of missing.slice(0, 50)) console.log(`  ${m}`);
}
process.exit(missing.length ? 1 : 0);