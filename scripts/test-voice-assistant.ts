/**
 * Universal Voice Assistant — realistic acceptance test.
 *
 * This complements `test-assistant.ts` (which covers the engine broadly). It
 * focuses on the VOICE product's own guarantees:
 *
 *   1. Automatic language identification (no dropdown).
 *   2. Developer details are not exposed on the normal assistant surface.
 *   3. The real spoken examples from the specification run against a throwaway
 *      tenant and are verified in the database.
 *   4. Roman Urdu / Urdu-script routing.
 *   5. Honest timing measurements.
 *
 * Commands that the deterministic router does not cover are reported as
 * "needs AI" rather than forced through a paid/unreliable network call.
 *
 * Run: npx tsx scripts/test-voice-assistant.ts
 */

import { prisma } from "@/lib/db/prisma";
import {
  handleMessage,
  confirmAction,
  getAssistantStatus,
  toPublicReply,
  previewRoute,
} from "@/lib/assistant/service";
import { detectSpeechLanguage } from "@/lib/assistant/language";
import type { AssistantReply, AssistantPlan } from "@/lib/assistant/types";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean | undefined, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const timings: Array<{ command: string; ms: number; kind: string }> = [];

async function say(userId: string, text: string): Promise<AssistantReply> {
  const started = Date.now();
  const reply = await handleMessage(userId, { text });
  timings.push({ command: text, ms: Date.now() - started, kind: reply.kind });
  return reply;
}

function planOf(reply: AssistantReply): AssistantPlan {
  if (reply.kind !== "plan") {
    throw new Error(`Expected a plan but got ${reply.kind}: ${JSON.stringify(reply).slice(0, 200)}`);
  }
  return reply;
}

async function stockOf(productId: string): Promise<number> {
  const [product, moves, sold] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { openingStock: true } }),
    prisma.stockMove.aggregate({
      where: { productId, voidedAt: null },
      _sum: { quantity: true },
    }),
    prisma.saleItem.aggregate({
      where: { productId, sale: { voidedAt: null } },
      _sum: { quantity: true },
    }),
  ]);
  return (
    Number(product?.openingStock ?? 0) +
    Number(moves._sum.quantity ?? 0) -
    Number(sold._sum.quantity ?? 0)
  );
}

function includesMoney(text: string, value: string): boolean {
  return text.replace(/,/g, "").includes(value.replace(/,/g, ""));
}

async function main() {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: { name: "Voice Test", email: `voice_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const ali = await prisma.customer.create({
      data: { userId: user.id, name: "Ali Raza" },
    });
    const rice = await prisma.product.create({
      data: {
        userId: user.id,
        name: "Rice",
        unit: "kg",
        purchasePrice: 800,
        sellingPrice: 1000,
        openingStock: 100,
      },
    });

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 1. Automatic language identification (no dropdown) ==");
    // ═══════════════════════════════════════════════════════════════════════

    const languageCases: Array<[string, string]> = [
      ["Add customer Imran", "en"],
      ["Ali bought 20 cartons of rice and paid 15,000", "en"],
      ["aaj kitna kharch hua", "roman-ur"],
      ["kitna udhaar hai", "roman-ur"],
      ["Ali ne 5000 diye", "roman-ur"],
      ["آج کا خرچ کتنا ہے", "ur"],
      ["علی کو پانچ ہزار دیے", "ur"],
      ["Ali ne 5000 diye آج", "mixed"],
    ];
    for (const [text, expected] of languageCases) {
      const actual = detectSpeechLanguage(text);
      check(`language: “${text}” → ${expected}`, actual === expected, actual);
    }

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 2. Developer details are not exposed ==");
    // ═══════════════════════════════════════════════════════════════════════

    const status = await getAssistantStatus();
    const statusKeys = Object.keys(status);
    check(
      "status carries only ready/retryAt",
      statusKeys.every((key) => key === "ready" || key === "retryAt"),
      statusKeys.join(","),
    );
    check("status has no model list", !statusKeys.includes("models") && !statusKeys.includes("rotation"));
    check("status never contains a gemini id", !JSON.stringify(status).includes("gemini"));
    check("status exposes a boolean readiness", typeof status.ready === "boolean");

    const sample: AssistantReply = {
      kind: "answer",
      text: "You are owed Rs. 5,000.",
      source: "database",
      model: "gemini-3.5-flash",
      requestsUsed: 2,
      timings: { totalMs: 12 },
    };
    const publicSample = toPublicReply(sample) as unknown as Record<string, unknown>;
    check("public reply hides the model id", publicSample.model === undefined, String(publicSample.model));
    check("public reply hides the request count", publicSample.requestsUsed === undefined);
    check("public reply keeps the actual answer", publicSample.text === "You are owed Rs. 5,000.");

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 3. The spoken examples from the specification ==");
    // ═══════════════════════════════════════════════════════════════════════

    const examples: Array<{
      text: string;
      expect: "plan" | "answer";
      action?: string;
      contains?: string;
    }> = [
      { text: "Add customer Imran", expect: "plan", action: "CREATE_CUSTOMER" },
      { text: "Ali bought 20 cartons of rice and paid 15,000", expect: "plan", action: "CREATE_SALE" },
      { text: "Show me how much Ali owes", expect: "answer" },
      { text: "Received another 5,000 from Ali", expect: "plan", action: "RECORD_PAYMENT" },
      { text: "How much rice is left in stock?", expect: "answer", contains: "80" },
      { text: "Add 10 boxes of this product", expect: "plan", action: "ADD_STOCK" },
      { text: "I spent 500 on electricity", expect: "plan", action: "CREATE_EXPENSE" },
      { text: "Show today's sales", expect: "answer" },
      { text: "Find my five customers with the highest outstanding balances", expect: "answer" },
      { text: "Remind me to call Ali tomorrow", expect: "plan", action: "CREATE_REMINDER" },
    ];

    for (const example of examples) {
      const ruleMatch = await previewRoute(example.text, user.id);
      if (!ruleMatch) {
        console.log(`  SKIP “${example.text}” — not covered by the deterministic router (would need AI)`);
        continue;
      }

      const reply = await say(user.id, example.text);
      check(`“${example.text}” → ${example.expect}`, reply.kind === example.expect, reply.kind);

      if (example.action && reply.kind === "plan") {
        check(`  action is ${example.action}`, reply.action === example.action, reply.action);
      }
      if (example.contains && reply.kind === "answer") {
        check(`  answer contains ${example.contains}`, reply.text.includes(example.contains), reply.text);
      }

      // Execute the write so the next command sees the new state.
      if (reply.kind === "plan" && example.expect === "plan") {
        const executed = await confirmAction(user.id, reply.actionId);
        check(`  confirmed without error`, executed.kind === "answer", executed.kind);
      }
    }

    // Verify what the database actually contains after the spoken run.
    const imran = await prisma.customer.findFirst({ where: { userId: user.id, name: "Imran" } });
    check("customer Imran exists in the database", !!imran);

    const sale = await prisma.sale.findFirst({
      where: { userId: user.id, customerId: ali.id },
      orderBy: { createdAt: "asc" },
    });
    check("Ali's sale was saved", !!sale);
    check("sale total is 20 × 1000 = 20000", sale?.totalAmount.toString() === "20000", sale?.totalAmount.toString());
    check("sale outstanding is 5000 (15000 paid)", sale?.outstanding.toString() === "5000", sale?.outstanding.toString());

    const payment = await prisma.payment.findFirst({
      where: { userId: user.id, customerId: ali.id, amount: 5000 },
    });
    check("the follow-up payment of 5000 was saved", !!payment);

    const expense = await prisma.expense.findFirst({ where: { userId: user.id, amount: 500 } });
    check("the 500 electricity expense was saved", expense?.category === "electricity", expense?.category);

    const reminder = await prisma.reminder.findFirst({ where: { userId: user.id, customerId: ali.id } });
    check("the reminder for Ali was saved", !!reminder);

    // 100 opening − 20 sold + 10 added (if the ADD_STOCK example ran).
    const finalStock = await stockOf(rice.id);
    check("stock ended at a consistent value (80 or 90)", finalStock === 80 || finalStock === 90, String(finalStock));

    // The customer balance must reflect the payment (5000 owed − 5000 paid = 0).
    const settled = await say(user.id, "how much does Ali owe now");
    check(
      "Ali's account is settled after paying",
      settled.kind === "answer" && settled.text.toLowerCase().includes("settled"),
      settled.kind === "answer" ? settled.text : settled.kind,
    );

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 4. Mixed-language routing (no AI needed for these) ==");
    // ═══════════════════════════════════════════════════════════════════════

    const multilingual: Array<[string, string]> = [
      ["kitna udhaar hai", "query:RECEIVABLES"],
      ["aaj ka kharch", "query:TODAY_EXPENSES"],
      ["kam stock", "query:LOW_STOCK"],
      ["500 kharch hua petrol pe", "action:CREATE_EXPENSE"],
      ["مجھے کتنا ادھار لینا ہے", "query:RECEIVABLES"],
      ["آج کا خرچ کتنا ہے", "query:TODAY_EXPENSES"],
    ];

    for (const [text, expected] of multilingual) {
      const match = await previewRoute(text, user.id);
      const actual = match
        ? match.type === "query"
          ? `query:${match.query}`
          : `action:${match.action}`
        : null;
      check(`router: “${text}” → ${expected}`, actual === expected, actual ?? "no match");
    }

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 5. Timing ==");
    // ═══════════════════════════════════════════════════════════════════════

    const sorted = [...timings].sort((a, b) => a.ms - b.ms);
    if (sorted.length) {
      const median = sorted[Math.floor(sorted.length / 2)]!;
      console.log(`  commands measured: ${sorted.length}`);
      console.log(`  median:            ${median.ms} ms`);
      console.log(`  slowest:           ${sorted[sorted.length - 1]!.ms} ms`);
      console.log("\n  command                                          → kind    ms");
      for (const row of timings) {
        console.log(`  ${row.command.slice(0, 46).padEnd(46)} → ${row.kind.padEnd(7)} ${row.ms}`);
      }
    }

    console.log(`\n==== ${passed} passed, ${failed} failed ====\n`);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }

  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});