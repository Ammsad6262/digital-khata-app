/**
 * Checks that the AI maps supplier/reminder questions and the new write
 * intents correctly.
 * Run: npx tsx scripts/verify-ai-queries.ts  (requires GEMINI_API_KEY)
 */

import { getAIProvider } from "@/lib/smart-entry/gemini-provider";
import type { AIContext } from "@/lib/smart-entry/ai-provider";

const context: AIContext = {
  customerNames: ["Ahmed", "Bilal"],
  productNames: ["Rice", "Sugar"],
  units: ["kg", "box", "piece", "dozen"],
};

const CASES: Array<{
  input: string;
  intent: string;
  queryType?: string;
  check?: (r: { supplierName?: string | null; reminderInDays?: number | null; explicitPaidAmount?: number | null }) => string | null;
}> = [
  { input: "How much do I owe my suppliers?", intent: "QUERY", queryType: "SUPPLIER_PAYABLES" },
  { input: "What reminders do I have today?", intent: "QUERY", queryType: "TODAYS_REMINDERS" },
  {
    input: "I paid Ali 5000",
    intent: "SUPPLIER_PAYMENT",
    check: (r) => {
      if (!r.supplierName) return "supplierName was null";
      if (Number(r.explicitPaidAmount) !== 5000) return `amount=${r.explicitPaidAmount}`;
      return null;
    },
  },
  {
    input: "Remind me to call Ahmed tomorrow",
    intent: "CREATE_REMINDER",
    check: (r) => (r.reminderInDays === 1 ? null : `reminderInDays=${r.reminderInDays}`),
  },
];

let failed = 0;

async function main() {
  const provider = getAIProvider();

  for (const testCase of CASES) {
    const result = await provider.interpretText(testCase.input, context);
    const intentOk = result.intent === testCase.intent;
    const queryOk = !testCase.queryType || result.queryType === testCase.queryType;
    const fieldError = testCase.check ? testCase.check(result) : null;
    const ok = intentOk && queryOk && !fieldError;
    console.log(
      `${ok ? "✅" : "❌"} "${testCase.input}" → intent=${result.intent}` +
        (result.queryType ? `, queryType=${result.queryType}` : "") +
        (fieldError ? ` — ${fieldError}` : ""),
    );
    if (!ok) failed++;
  }

  if (failed > 0) {
    console.log(`\n${failed} case(s) misrouted.`);
    process.exit(1);
  }
  console.log("\nAll AI routing cases passed.");
}

main().catch((e) => {
  console.error("AI routing check crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
