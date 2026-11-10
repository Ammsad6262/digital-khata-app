/**
 * Plan-warning localisation tests (pure — no database, no AI).
 *
 * The orchestrator emits English warning sentences; the modal maps them back to
 * translation keys so Urdu users read them in Urdu. These tests pin the mapping
 * and prove an unmapped sentence degrades to its English text.
 *
 * Usage: npx tsx scripts/test-assistant-warnings.ts
 */

import { warningKeysFromEnglish } from "../src/lib/assistant/warnings";

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

const one = (text: string) => warningKeysFromEnglish([text])[0]!;

{
  const w = one("No product named “Marshmallows” yet.");
  ok(w.key === "plan.warn.noProductNamed", "product-named maps to key", w.key);
  ok(w.params?.name === "Marshmallows", "product name captured", String(w.params?.name));
}

{
  const w = one('No product named "Soap" yet.');
  ok(w.key === "plan.warn.noProductNamed", "straight quotes also match", w.key);
}

{
  const w = one("No customer was mentioned.");
  ok(w.key === "plan.warn.noCustomer", "generic customer maps", w.key);
}

{
  const w = one("No supplier named “Cement House” yet.");
  ok(w.key === "plan.warn.noSupplierNamed", "supplier-named maps", w.key);
  ok(w.params?.name === "Cement House", "supplier name captured", String(w.params?.name));
}

{
  const w = one("Paid Rs. 5,000 is more than the sale total Rs. 4,000.");
  ok(w.key === "plan.warn.overpaid", "overpaid maps", w.key);
  ok(w.params?.paid === "Rs. 5,000" && w.params?.total === "Rs. 4,000", "amounts captured", JSON.stringify(w.params));
}

{
  const w = one("Only 3 kg of Rice in stock — this sale will oversell.");
  ok(w.key === "plan.warn.oversell", "oversell maps", w.key);
  ok(w.params?.current === "3" && w.params?.unit === "kg" && w.params?.name === "Rice", "oversell params", JSON.stringify(w.params));
}

{
  const w = one("This reverses money and inventory. Confirm only if you are sure.");
  ok(w.key === "plan.warn.void", "void warning maps", w.key);
}

{
  const w = one("Something totally unexpected happened.");
  ok(w.key === "", "unmapped warning has no key", w.key);
  ok(w.text === "Something totally unexpected happened.", "unmapped warning keeps its text", w.text);
}

// Every warning in a batch maps independently.
{
  const list = warningKeysFromEnglish([
    "No customer named “Ahmed” yet. Pick a customer or add them.",
    "No product named “Soap” yet.",
  ]);
  ok(list.length === 2, "batch length preserved");
  ok(list[0]!.key === "plan.warn.noCustomerNamed", "batch[0] customer-named");
  ok(list[1]!.key === "plan.warn.noProductNamed", "batch[1] product-named");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
