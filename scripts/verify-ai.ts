/**
 * Verifies the Gemini provider actually works with the configured API key.
 * Run: npx tsx scripts/verify-ai.ts
 */

import { getAIProvider } from "@/lib/smart-entry/gemini-provider";
import type { AIContext } from "@/lib/smart-entry/ai-provider";

const context: AIContext = {
  customerNames: ["Ahmed", "Bilal"],
  productNames: ["Rice", "Sugar"],
  units: ["kg", "box", "piece", "dozen"],
};

async function main() {
  const provider = getAIProvider();
  console.log("Provider:", provider.name);
  console.log("GEMINI_API_KEY set:", !!process.env.GEMINI_API_KEY);

  const input = "Ahmed bought 5 boxes of Rice at 1200 per box, paid 2000";
  console.log(`\nInput: "${input}"`);
  const result = await provider.interpretText(input, context);
  console.log("\nInterpretation:");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n✅ AI provider responded with a schema-valid interpretation.");
}

main().catch((e) => {
  console.error("\n❌ AI verification failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
