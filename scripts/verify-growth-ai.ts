/**
 * Live check of the Growth Assistant AI narration.
 * Run: npx tsx scripts/verify-growth-ai.ts [email]
 *
 * Fails only if the narration is unsafe (invented numbers or profit claims).
 * A deterministic fallback is a valid outcome when Gemini is unavailable.
 */

import { prisma } from "@/lib/db/prisma";
import { getGrowthPlan, growthFactsForNarration } from "@/lib/services/growth";
import { narrateGrowthPlan, numbersAreSupported } from "@/lib/services/growth-narration";

const email = process.argv[2] ?? "sadatrehman2004@gmail.com";

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account with email ${email}`);

  const plan = await getGrowthPlan(user.id);
  const facts = growthFactsForNarration(plan);

  console.log(`\nPlan: ${plan.recommendations.length} recommendations`);
  for (const r of plan.recommendations.slice(0, 4)) {
    console.log(`  · [${r.priority}] ${r.title}${r.amount ? ` — ${r.amount}` : ""}`);
  }

  const started = Date.now();
  const narration = await narrateGrowthPlan(user.id);
  const elapsed = Date.now() - started;

  console.log(`\nSource: ${narration.source} (${elapsed}ms)`);
  console.log(`Text: ${narration.text}\n`);

  let failed = 0;
  const assert = (label: string, ok: boolean) => {
    console.log(`${ok ? "✅" : "❌"} ${label}`);
    if (!ok) failed++;
  };

  assert("narration is not empty", narration.text.trim().length > 0);
  assert("every number is supported by the facts", numbersAreSupported(narration.text, facts));
  assert("no profit/earnings claims", !/profit|earning|income/i.test(narration.text));
  assert("stays within 600 characters", narration.text.length <= 600);

  if (failed > 0) process.exit(1);
  console.log("AI narration is safe.");
}

main()
  .catch((e) => {
    console.error("Growth AI check crashed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
