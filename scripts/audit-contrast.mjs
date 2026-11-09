/**
 * Contrast gate — every theme's text tokens must meet WCAG AA (4.5:1).
 *
 * Parses globals.css theme blocks and checks the actual token pairs the UI
 * uses, so a "prettier but fainter" palette cannot silently regress.
 *
 * Usage: node scripts/audit-contrast.mjs
 */

import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");

const blockRe = /(:root,\s*\[data-theme="ink"\]|\[data-theme="([a-z]+)"\])\s*\{([\s\S]*?)\}/g;
const themes = [];
for (const m of css.matchAll(blockRe)) {
  const name = m[2] ?? "ink";
  const tokens = {};
  for (const t of m[3].matchAll(/--([\w-]+):\s*([0-9]+)\s+([0-9]+)\s+([0-9]+)\s*;/g)) {
    tokens[t[1]] = [Number(t[2]), Number(t[3]), Number(t[4])];
  }
  if (Object.keys(tokens).length) themes.push({ name, tokens });
}

const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const pairs = [
  ["ink", "ink", "surface"],
  ["ink-muted", "ink-muted", "surface"],
  ["ink-subtle", "ink-subtle", "surface"],
  ["ink-faint", "ink-faint", "surface"],
  ["ink-faint-on-bg", "ink-faint", "bg"],
  ["success-ink", "success-ink", "success-soft"],
  ["warning-ink", "warning-ink", "warning-soft"],
  ["danger-ink", "danger-ink", "danger-soft"],
  ["info-ink", "info-ink", "info-soft"],
];

let fails = 0;
for (const { name, tokens } of themes) {
  for (const [label, fgKey, bgKey] of pairs) {
    const fg = tokens[fgKey];
    const bg = tokens[bgKey];
    if (!fg || !bg) continue;
    const ratio = contrast(fg, bg);
    const ok = ratio >= 4.5;
    if (!ok) fails++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${name.padEnd(8)} ${label.padEnd(18)} ${ratio.toFixed(2)}:1`,
    );
  }
}

console.log(`\nThemes: ${themes.length}   Failures: ${fails}`);
process.exit(fails ? 1 : 0);