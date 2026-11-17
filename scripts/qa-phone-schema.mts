/**
 * Proves the customer schema really treats phone as optional.
 * Run:  npx tsx scripts/qa-phone-schema.mts
 */
import { createCustomerSchema } from "../src/lib/schemas/customer";

const cases: Array<{ label: string; input: unknown; shouldPass: boolean }> = [
  { label: "no phone at all (field absent)", input: { name: "Ali" }, shouldPass: true },
  { label: 'empty phone "" (the form default)', input: { name: "Ali", phone: "" }, shouldPass: true },
  { label: "whitespace phone", input: { name: "Ali", phone: "   " }, shouldPass: true },
  { label: "null phone", input: { name: "Ali", phone: null }, shouldPass: true },
  { label: "valid phone", input: { name: "Ali", phone: "03001234567" }, shouldPass: true },
  { label: "too short phone", input: { name: "Ali", phone: "123" }, shouldPass: false },
  { label: "letters in phone", input: { name: "Ali", phone: "0300abc1234" }, shouldPass: false },
  { label: "name missing", input: { name: "", phone: "" }, shouldPass: false },
  { label: "full record, no phone", input: { name: "Ali", companyName: "Ali Store", address: "Shop 4", notes: "pays monthly", openingBalance: 500 }, shouldPass: true },
];

let failures = 0;
for (const testCase of cases) {
  const result = createCustomerSchema.safeParse(testCase.input);
  const ok = result.success === testCase.shouldPass;
  if (!ok) failures += 1;
  const detail = result.success
    ? `parsed phone=${JSON.stringify(result.data.phone)} openingBalance=${JSON.stringify(result.data.openingBalance)}`
    : `rejected: ${result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${testCase.label.padEnd(38)} -> ${detail}`);
}

console.log(failures === 0 ? "\nall schema cases behave as intended" : `\n${failures} case(s) wrong`);
process.exit(failures === 0 ? 0 : 1);
