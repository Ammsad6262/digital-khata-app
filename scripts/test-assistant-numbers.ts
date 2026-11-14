/**
 * Spoken-quantity guard tests (pure — no database, no AI).
 *
 * Regression for the reported "I said 25 kilo and it wrote 50" bug: the
 * transcript is authoritative for a number followed by a unit.
 *
 * Usage: npx tsx scripts/test-assistant-numbers.ts
 */

import { guardSpokenQuantity, spokenQuantity } from "../src/lib/assistant/spoken-numbers";
import type { RouteAction, RouteQuery } from "../src/lib/assistant/types";

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

const readCases: Array<[string, number | null, string]> = [
  ["ahmad bought 25 kilo rice", 25, "English 25 kilo"],
  ["25 kg rice", 25, "English 25 kg"],
  ["۲۵ کیلو وریجې", 25, "Pashto digits + Pashto unit"],
  ["٢٥ كيلو", 25, "Arabic-Indic digits"],
  ["10 bags sugar", 10, "bags"],
  ["2 cartons", 2, "cartons"],
  ["no number here", null, "no quantity"],
  ["ahmad bought rice", null, "quantity with no unit is not guessed"],
];
for (const [text, expected, label] of readCases) {
  const got = spokenQuantity(text);
  ok(got === expected, label, `got ${got}`);
}

const sale: RouteAction = {
  type: "action",
  action: "CREATE_SALE",
  fields: { quantity: 50 },
  missing: [],
  confidence: 0.8,
  matched: "ai",
};

{
  const guarded = guardSpokenQuantity(sale, "ahmad bought 25 kilo rice");
  ok(guarded.type === "action" && guarded.fields.quantity === 25, "25 overrides a model's 50");
}

{
  const guarded = guardSpokenQuantity(sale, "ahmad bought 25 kilo rice");
  ok(guarded !== sale, "returns a new match instead of mutating");
}

{
  const correct: RouteAction = { ...sale, fields: { quantity: 25 } };
  const guarded = guardSpokenQuantity(correct, "ahmad bought 25 kilo rice");
  ok(guarded === correct, "a correct quantity is left alone");
}

{
  const guarded = guardSpokenQuantity(sale, "ahmad bought rice");
  ok(guarded === sale, "no unit means no override");
}

{
  const query: RouteQuery = {
    type: "query",
    query: "DASHBOARD",
    confidence: 0.8,
    matched: "ai",
  };
  ok(guardSpokenQuantity(query, "25 kilo") === query, "queries are untouched");
}

{
  const expense: RouteAction = {
    type: "action",
    action: "CREATE_EXPENSE",
    fields: { amount: 500 },
    missing: [],
    confidence: 0.8,
    matched: "ai",
  };
  ok(guardSpokenQuantity(expense, "25 kilo") === expense, "expenses are untouched");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);