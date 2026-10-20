/**
 * Checks that the AI maps supplier/reminder questions to the new query types.
 * Run: npx tsx scripts/verify-ai-queries.ts  (requires GEMINI_API_KEY)
 */

import { getAIProvider } from "@/lib/smart-entry/gemini-provider";
import type { AIContext } from "@/lib/smart-entry/ai-provider";

const context: AIContext = {
  customerNames: ["Ahmed", "Bilal"],
  productNames: ["Rice", "Sugar"],
  units: ["kg", "box", "piece", "dozen"],
};

const CASES = [
  { input: "How much do I owe my suppliers?", expected: "SUPPLIER_PAYABLES" },
  { input: "What reminders do I have today?", expected: "TODAYS_REMINDERS" },
];

let failed = 0;

async function main() {
  const provider = getAIProvider();

  for (const testCase of CASES) {
    const result = await provider.interpretText(testCase.input, context);
    const ok = result.intent === "QUERY" && result.queryType === testCase.expected;
    console.log(
      `${ok ? "✅" : "❌"} "${testCase.input}" → intent=${result.intent}, queryType=${result.queryType ?? "null"} (expected ${testCase.expected})`,
    );
    if (!ok) failed++;
  }

  if (failed > 0) {
    console.log(`\n${failed} case(s) misrouted.`);
    process.exit(1);
  }
  console.log("\nAll AI query cases routed correctly.");
}

main().catch((e) => {
  console.error("AI query check crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
