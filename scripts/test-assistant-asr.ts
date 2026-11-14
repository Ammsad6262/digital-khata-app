/**
 * ASR transcript correction tests (pure — no database, no AI).
 *
 * The browser speech engine hears business words as everyday homophones:
 * "khalid bought" becomes "khalid boat", the rule engine sees no verb, and the
 * command is escalated to the model, which then answers something unrelated.
 * These tests pin the correction layer that stops that.
 *
 * Usage: npx tsx scripts/test-assistant-asr.ts
 */

import { correctTranscript, correctVerbs } from "../src/lib/assistant/asr";

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

const verbCases: Array<[string, string, string]> = [
  ["khalid boat 5 rice", "khalid bought 5 rice", "boat -> bought"],
  ["Ali sole 2 cartoons", "Ali sold 2 cartons", "sole -> sold, cartoon -> carton"],
  ["he payed 5000", "he paid 5000", "payed -> paid"],
  ["Khalid bort 20 bags", "Khalid bought 20 bags", "bort -> bought"],
  ["udhaar kharida 5 kg", "udhaar kharida 5 kg", "correct Roman Urdu untouched"],
  ["cash sale 500", "cash sale 500", "ordinary business words untouched"],
  ["received 5000 from Ali", "received 5000 from Ali", "already-correct verb untouched"],
  ["boat 15000", "bought 15000", "numbers are never changed"],
];

for (const [input, expected, label] of verbCases) {
  const got = correctVerbs(input).text;
  ok(got === expected, label, `got "${got}"`);
}

const ctx = {
  customers: [{ name: "Khalid" }, { name: "Ahmed" }],
  products: [
    { name: "Rice", unit: "kg" },
    { name: "Sugar", unit: "kg" },
  ],
  suppliers: [{ name: "Ali" }],
  units: ["kg", "Carton"],
};

const snapCases: Array<[string, string, string]> = [
  ["khalid boat 5 rise", "Khalid bought 5 Rice", "name + product + verb fixed"],
  ["kalid paid 500", "Khalid paid 500", "misheard name snapped to saved customer"],
  ["20 kg rise to Ahmed", "20 kg Rice to Ahmed", "product snapped when it exists"],
  ["Ali sold 2 kartoon", "Ali sold 2 Carton", "unit snapped to saved unit"],
  ["خالد boat 5", "Khalid bought 5", "cross-script name snapped"],
];

for (const [input, expected, label] of snapCases) {
  const got = correctTranscript(input, ctx).text;
  ok(got === expected, label, `got "${got}"`);
}

// Never invent an entity the shop does not have.
{
  const got = correctTranscript("khalid boat 5 rise", { customers: [{ name: "Khalid" }] }).text;
  // Khalid is fixed, but "rise" must stay "rise" because there is no Rice product.
  ok(got === "Khalid bought 5 rise", "unknown product is not invented", `got "${got}"`);
}

// A genuinely different name must not be merged.
{
  const got = correctTranscript("Amir boat 2 bags", {
    customers: [{ name: "Amir" }, { name: "Umar" }],
  }).text;
  ok(got === "Amir bought 2 bags", "different customer names are not merged", `got "${got}"`);
}

// Corrections are reported so the UI can show what changed.
{
  const result = correctTranscript("khalid boat 5 rise", ctx);
  const kinds = result.corrections.map((c) => `${c.from}=>${c.to}`);
  ok(
    result.corrections.length === 3 &&
      kinds.includes("boat=>bought") &&
      kinds.includes("khalid=>Khalid") &&
      kinds.includes("rise=>Rice"),
    "corrections are reported",
    JSON.stringify(result.corrections),
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
