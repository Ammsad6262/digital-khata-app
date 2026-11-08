/**
 * RTL utility audit.
 *
 * Tailwind ships physical-direction utilities (ml-*, left-*, rounded-l-* …).
 * globals.css patches a hand-written subset of them for RTL. Any physical
 * utility used in the app but NOT in that patch list will silently render
 * un-mirrored in Urdu. This script finds those gaps.
 *
 * Usage: node scripts/rtl-audit.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const GLOBALS = readFileSync("src/app/globals.css", "utf8");

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(p)) files.push(p);
  }
})(ROOT);

// Physical-direction prefixes that need mirroring.
const PREFIX = /^(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|border-l-|border-r-|space-x|float-left|float-right)-.+$/;

const usage = new Map(); // token -> count

for (const f of files) {
  if (f.endsWith("globals.css")) continue; // don't count the patch itself
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/[\w-]+/g)) {
    const t = m[0];
    if (PREFIX.test(t) || t === "text-left" || t === "text-right" || t === "float-left" || t === "float-right") {
      usage.set(t, (usage.get(t) || 0) + 1);
    }
  }
}

// Which tokens are already handled by an RTL override in globals.css?
const isPatched = (token) => new RegExp(`\\.${token.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![\\w-])`).test(GLOBALS);

const gaps = [...usage.entries()]
  .filter(([t]) => !isPatched(t))
  .sort((a, b) => b[1] - a[1]);

const covered = [...usage.entries()].filter(([t]) => isPatched(t)).length;

console.log(`Distinct physical RTL-sensitive classes used: ${usage.size}`);
console.log(`Already patched in globals.css:             ${covered}`);
console.log(`Un-mirrored in RTL:                          ${gaps.length}\n`);

if (gaps.length) {
  console.log("Gaps (class × uses):");
  for (const [t, n] of gaps) console.log(`  ${t}  ×${n}`);
}
