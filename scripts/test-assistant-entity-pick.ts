/**
 * Entity-pick decision tests (pure).
 *
 * nameScore is quantised (0, 70, 78, 80, 82, 86, 90, 92, 96, 100), so the
 * auto-select rules must use those tiers. These tests pin the behaviour:
 * exact wins, a unique strong match auto-selects, ambiguity requires a pick.
 *
 * Usage: npx tsx scripts/test-assistant-entity-pick.ts
 */

import { pickEntity } from "../src/lib/assistant/entity-pick";

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

const rows = (entries: Array<[string, number]>) =>
  entries.map(([name, score]) => ({ row: { name }, score }));

{
  const picked = pickEntity(rows([["Ahmad", 100], ["Ahmad Khan", 82]]));
  ok(picked.entity?.name === "Ahmad" && picked.candidates.length === 0, "exact match wins over a near-duplicate");
}

{
  const picked = pickEntity(rows([["Aramoni", 96]]));
  ok(picked.entity?.name === "Aramoni", "near-exact (96) auto-selects", JSON.stringify(picked));
}

{
  const picked = pickEntity(rows([["Aramoni", 92], ["Aramoni Traders", 92]]));
  ok(picked.entity === null && picked.candidates.length === 2, "two strong matches require a pick", JSON.stringify(picked));
}

{
  const picked = pickEntity(rows([["Daga", 90]]));
  ok(picked.entity?.name === "Daga", "a single strong match auto-selects", JSON.stringify(picked));
}

{
  const picked = pickEntity(rows([["Daga", 86]]));
  ok(picked.entity?.name === "Daga", "h-tolerant 86 auto-selects when unique", JSON.stringify(picked));
}

{
  const picked = pickEntity(rows([["Daga", 82], ["Dhaga", 80]]));
  ok(picked.entity === null && picked.candidates.length === 2, "medium matches are offered, not picked", JSON.stringify(picked));
}

{
  const picked = pickEntity(rows([["Daga", 70]]));
  ok(picked.entity === null && picked.candidates.length === 1, "a weak 70 is a candidate", JSON.stringify(picked));
}

{
  const picked = pickEntity(rows([["Daga", 0]]));
  ok(picked.entity === null && picked.candidates.length === 0, "no match returns nothing", JSON.stringify(picked));
}

{
  const picked = pickEntity([]);
  ok(picked.entity === null && picked.candidates.length === 0, "empty input returns nothing");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

export {};