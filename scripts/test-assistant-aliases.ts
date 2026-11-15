/**
 * Name-alias memory tests (pure — no browser needed).
 *
 * When the owner corrects a misheard name by picking the saved record, the
 * mapping is remembered and applied to future transcripts, so the assistant
 * stops needing the model for that name.
 *
 * Usage: npx tsx scripts/test-assistant-aliases.ts
 */

import {
  applyAliasesWith,
  rememberAliasIn,
  type AliasMap,
} from "../src/lib/assistant/aliases";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, label: string, detail?: string) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
  }
};

let aliases: AliasMap = {};

ok(
  applyAliasesWith(aliases, "ahmad bought 25 kilo dhaaga") === "ahmad bought 25 kilo dhaaga",
  "no aliases: text unchanged",
);

aliases = rememberAliasIn(aliases, "dhaaga", "Daga");
ok(Object.keys(aliases).length === 1, "one alias remembered", String(Object.keys(aliases).length));

const fixed = applyAliasesWith(aliases, "ahmad bought 25 kilo dhaaga");
ok(fixed === "ahmad bought 25 kilo Daga", "misheard product auto-corrected", fixed);

ok(
  applyAliasesWith(aliases, "dhaaga cloth") === "Daga cloth",
  "alias applies at the start",
  applyAliasesWith(aliases, "dhaaga cloth"),
);

const substring = applyAliasesWith(aliases, "dhaagaa");
ok(substring === "dhaagaa", "alias does not match inside a longer word", substring);

aliases = rememberAliasIn(aliases, "ahmet", "Ahmad");
ok(
  applyAliasesWith(aliases, "ahmet bought dhaaga") === "Ahmad bought Daga",
  "multiple aliases apply together",
  applyAliasesWith(aliases, "ahmet bought dhaaga"),
);

const before = Object.keys(aliases).length;
aliases = rememberAliasIn(aliases, "dhaaga", "Daga");
ok(Object.keys(aliases).length === before, "re-remembering does not duplicate", String(Object.keys(aliases).length));

const selfMap = rememberAliasIn({}, "Daga", "Daga");
ok(Object.keys(selfMap).length === 0, "case-only mapping is ignored", JSON.stringify(selfMap));

const longest = applyAliasesWith({ dhaaga: "Daga", "dhaaga cloth": "Daga Cloth" }, "dhaaga cloth");
ok(longest === "Daga Cloth", "longer phrase wins over a shorter one", longest);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

export {};