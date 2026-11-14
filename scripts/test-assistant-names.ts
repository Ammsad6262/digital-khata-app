/**
 * Cross-script name matching tests (pure — no database, no AI).
 *
 * The voice transcript may be Urdu ("احمد") while the saved customer is Latin
 * ("Ahmed"). These tests pin that join so the confirmation card stops offering
 * to create a customer who already exists.
 *
 * Usage: npx tsx scripts/test-assistant-names.ts
 */

import { nameScore, namesMatch } from "../src/lib/assistant/names";
import { matchEntities, normalizeText } from "../src/lib/assistant/nlg";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, label: string, detail?: string) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const pairs: Array<[string, string, string]> = [
  ["احمد", "Ahmed", "Ahmed/احمد"],
  ["احمد", "Ahmad", "Ahmad/احمد"],
  ["علی", "Ali", "Ali/علی"],
  ["بلال", "Bilal", "Bilal/بلال"],
  ["بلال", "Belal", "Belal/بلال"],
  ["محمد", "Muhammad", "Muhammad/محمد"],
  ["محمد", "Mohammed", "Mohammed/محمد"],
  ["محمد", "Mohammad", "Mohammad/محمد"],
  ["عمر", "Umar", "Umar/عمر"],
  ["عمر", "Omar", "Omar/عمر"],
  ["عثمان", "Usman", "Usman/عثمان"],
  ["ورجی", "Warji", "Warji/ورجی"],
  ["ورگی", "Warji", "one-letter cross-script variant"],
  ["خان", "Khan", "Khan/خان"],
  ["جان", "Jan", "Jan/جان"],
  ["ګل", "Gul", "Gul/ګل (Pashto ګ)"],
  ["مُحَمَّد", "محمد", "diacritics are ignored"],
  ["  Ahmed  ", "ahmed", "case/space are ignored"],
  ["Ahmed Khan", "احمد", "short form matches a full saved name"],
];

for (const [a, b, label] of pairs) {
  ok(namesMatch(a, b) && namesMatch(b, a), label, `${nameScore(a, b)}`);
}

const negatives: Array<[string, string]> = [
  ["Ahmed", "Bilal"],
  ["احمد", "بلال"],
  ["Rice", "Ahmed"],
  ["Sugar", "Wheat"],
];
for (const [a, b] of negatives) {
  ok(!namesMatch(a, b), `different names: ${a} / ${b}`, `${nameScore(a, b)}`);
}

// The router's entity matcher must find the saved customer from Urdu text.
{
  const customers = [{ id: "c1", name: "Ahmed" }];
  const found = matchEntities("20 kg rice to احمد", customers);
  ok(found.length === 1 && found[0]!.entity.id === "c1", "router finds Ahmed from احمد");
}

// ...and must not invent a match for a different customer.
{
  const found = matchEntities("20 kg rice to بلال", [{ id: "c1", name: "Ahmed" }]);
  ok(found.length === 0, "router does not match a different spoken name");
}

// Exact Latin still works (regression guard).
{
  const found = matchEntities(normalizeText("Ahmed bought 25 kg rice"), [
    { id: "c1", name: "Ahmed" },
  ]);
  ok(found.length === 1 && found[0]!.exact === true, "exact Latin match still works");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
