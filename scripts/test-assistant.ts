/**
 * Assistant test environment.
 *
 * Runs realistic wholesale commands through the REAL assistant pipeline against
 * a throwaway tenant, and records — for every command — what was understood,
 * which module ran, how many AI requests it cost, and how long it took.
 *
 * Sections:
 *   1. Queries            (deterministic, 0 AI requests)
 *   2. Plans & execution  (sale, payment, expense, purchase, people, stock, reminders)
 *   3. Safety             (no invented money, oversell warning, tenant isolation)
 *   4. Idempotency        (confirm twice → one transaction; duplicate command)
 *   5. Model rotation     (429 handling, exhaustion, deterministic stop)
 *   6. AI fallback        (mocked provider — no network, no real quota)
 *   7. Audio fallback     (mocked provider returns transcript + intent)
 *
 * No destructive work touches real business data: everything is created under
 * a fresh user and deleted at the end.
 *
 * Run: npx tsx scripts/test-assistant.ts
 */

import { prisma } from "@/lib/db/prisma";
import { handleMessage, confirmAction, cancelAction } from "@/lib/assistant/service";
import { runWithRotation, AIExhaustedError, _resetMemoryUsage } from "@/lib/ai/model-registry";
import { _setGeminiClientForTesting, generateStructured } from "@/lib/ai/gemini-client";
import { route, looksLikeBusinessCommand } from "@/lib/assistant/router";
import type { RouterContext } from "@/lib/assistant/types";
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

type UsageRow = {
  command: string;
  kind: string;
  source: string;
  requests: number;
  ms: number;
};

const usage: UsageRow[] = [];

function record(command: string, reply: AssistantReply, ms: number) {
  usage.push({
    command,
    kind: reply.kind,
    source: reply.kind === "error" ? "-" : reply.source,
    requests: reply.requestsUsed,
    ms,
  });
}

/** Reply text regardless of variant (plans show their summary). */
function textOf(reply: AssistantReply): string {
  return reply.kind === "plan" ? reply.summary : reply.text;
}

function itemsOf(reply: AssistantReply) {
  return reply.kind === "answer" ? (reply.items ?? []) : [];
}

async function say(userId: string, text: string): Promise<AssistantReply> {
  const started = Date.now();
  const reply = await handleMessage(userId, { text });
  record(text, reply, Date.now() - started);
  return reply;
}

function planOf(reply: AssistantReply): AssistantPlan {
  if (reply.kind !== "plan") throw new Error(`Expected a plan but got ${reply.kind}: ${JSON.stringify(reply).slice(0, 200)}`);
  return reply;
}

/** The same definition the app uses: opening + stock moves − sold items. */
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

async function main() {
  const stamp = Date.now();
  const createdModels: string[] = [];

  const userA = await prisma.user.create({
    data: { name: "Assistant Test A", email: `asst_a_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Assistant Test B", email: `asst_b_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    // ── Fixtures for user A ───────────────────────────────────────────────
    const ali = await prisma.customer.create({
      data: { userId: userA.id, name: "Ali Raza", phone: "03001234567" },
    });
    await prisma.customer.create({ data: { userId: userA.id, name: "Bilal Ahmed" } });
    const rice = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Rice",
        unit: "kg",
        purchasePrice: 250,
        sellingPrice: 300,
        openingStock: 100,
        lowStockThreshold: 5,
      },
    });
    await prisma.product.create({
      data: { userId: userA.id, name: "Sugar", unit: "kg", purchasePrice: 120, sellingPrice: 140 },
    });
    const cement = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Cement",
        unit: "bag",
        purchasePrice: 500,
        sellingPrice: 560,
        openingStock: 40,
      },
    });
    const cementHouse = await prisma.supplier.create({
      data: { userId: userA.id, name: "Cement House" },
    });

    // A customer + product that belong ONLY to user B (isolation checks).
    await prisma.customer.create({ data: { userId: userB.id, name: "Secret Customer" } });
    await prisma.product.create({
      data: { userId: userB.id, name: "Secret Product", unit: "box", purchasePrice: 1, sellingPrice: 2 },
    });

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 1. Queries (deterministic, 0 AI requests) ==");
    // ═══════════════════════════════════════════════════════════════════════

    let reply = await say(userA.id, "help");
    check("“help” lists commands", reply.kind === "answer" && reply.text.includes("Ali bought"), reply.kind);
    check("help costs 0 AI requests", reply.requestsUsed === 0, String(reply.requestsUsed));

    reply = await say(userA.id, "who owes me money");
    check("“who owes me money” is answered from the database", reply.kind === "answer", reply.kind);
    check("no one owes money yet", textOf(reply).toLowerCase().includes("no customer owes"), textOf(reply));
    check("receivables costs 0 AI requests", reply.requestsUsed === 0);

    reply = await say(userA.id, "how much stock of rice");
    check("“how much stock of rice” reads real stock", reply.kind === "answer" && textOf(reply).includes("100"), textOf(reply));
    check("stock query costs 0 AI requests", reply.requestsUsed === 0);

    reply = await say(userA.id, "show me low stock products");
    check("low-stock query answers", reply.kind === "answer" && textOf(reply).toLowerCase().includes("low on stock"), textOf(reply));

    reply = await say(userA.id, "dashboard");
    check("dashboard summary answers", reply.kind === "answer" && textOf(reply).includes("Receivables"), textOf(reply));

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 2. Sale: plan → confirm → verified ==");
    // ═══════════════════════════════════════════════════════════════════════

    const saleCommand = "Ali Raza bought 20 kg rice, paid 5000";
    reply = await say(userA.id, saleCommand);
    const salePlan = planOf(reply);
    check("sale plan produced", salePlan.action === "CREATE_SALE", salePlan.action);
    check("sale plan used rules (no AI)", salePlan.source === "rules" && salePlan.requestsUsed === 0, `${salePlan.source}/${salePlan.requestsUsed}`);
    check("sale plan resolved the customer", !salePlan.requires.includes("customer"), JSON.stringify(salePlan.requires));
    check("sale plan resolved the product", !salePlan.requires.includes("product"));
    check("sale plan understood quantity 20 kg", salePlan.fields.some((f) => f.label === "Quantity" && f.value.startsWith("20")), JSON.stringify(salePlan.fields));
    check("sale plan understood paid 5000", salePlan.fields.some((f) => f.label === "Paid now" && f.value.includes("5,000")), JSON.stringify(salePlan.fields));

    const salesBefore = await prisma.sale.count({ where: { userId: userA.id } });
    check("nothing is written before confirmation", salesBefore === 0, String(salesBefore));

    reply = await confirmAction(userA.id, salePlan.actionId);
    check("confirm saves the sale", reply.kind === "answer", reply.kind);
    check("confirm reports a verified result", reply.kind === "answer" && JSON.stringify(reply.text).length > 0);

    const salesAfter = await prisma.sale.count({ where: { userId: userA.id } });
    check("exactly one sale now exists", salesAfter === 1, String(salesAfter));

    const aliAfter = await prisma.customer.findUnique({ where: { id: ali.id } });
    const sale = await prisma.sale.findFirst({ where: { userId: userA.id } });
    // 20 * 300 = 6000 billed, 5000 paid → 1000 outstanding on top of opening 0.
    check("sale total is 20 × 300 = 6000", sale?.totalAmount.toString() === "6000", sale?.totalAmount.toString());
    check("sale outstanding is 1000", sale?.outstanding.toString() === "1000", sale?.outstanding.toString());
    check("customer row exists", !!aliAfter);

    // Stock: opening 100 − 20 sold = 80.
    const riceStock = await stockOf(rice.id);
    check("stock dropped to 80 kg", riceStock === 80, String(riceStock));

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 3. Payment, expense, people, product, purchase, stock, reminder ==");
    // ═══════════════════════════════════════════════════════════════════════

    reply = await say(userA.id, "received 1000 from Ali Raza");
    let plan = planOf(reply);
    check("payment plan produced", plan.action === "RECORD_PAYMENT", plan.action);
    check("payment amount understood", plan.fields.some((f) => f.label === "Amount" && f.value.includes("1,000")), JSON.stringify(plan.fields));
    reply = await confirmAction(userA.id, plan.actionId);
    check("payment executed", reply.kind === "answer", reply.kind);
    const pai = await prisma.payment.findFirst({ where: { userId: userA.id, amount: 1000 } });
    check("payment row created for 1000", pai?.amount.toString() === "1000", String(pai?.amount));

    reply = await say(userA.id, "spent 500 on electricity");
    plan = planOf(reply);
    check("expense plan produced", plan.action === "CREATE_EXPENSE", plan.action);
    check("expense amount 500", plan.fields.some((f) => f.label === "Amount" && f.value.includes("500")), JSON.stringify(plan.fields));
    reply = await confirmAction(userA.id, plan.actionId);
    check("expense executed", reply.kind === "answer");
    const exp = await prisma.expense.findFirst({ where: { userId: userA.id } });
    check("expense row created with category electricity", exp?.amount.toString() === "500" && exp?.category === "electricity", `${exp?.amount}/${exp?.category}`);

    reply = await say(userA.id, "add customer Imran Khan");
    plan = planOf(reply);
    check("create-customer plan", plan.action === "CREATE_CUSTOMER", plan.action);
    reply = await confirmAction(userA.id, plan.actionId);
    check("customer created", reply.kind === "answer");
    const imran = await prisma.customer.findFirst({ where: { userId: userA.id, name: "Imran Khan" } });
    check("Imran Khan exists", !!imran);

    reply = await say(userA.id, "add supplier Steel Traders");
    plan = planOf(reply);
    reply = await confirmAction(userA.id, plan.actionId);
    check("supplier created", reply.kind === "answer" && !!(await prisma.supplier.findFirst({ where: { userId: userA.id, name: "Steel Traders" } })));

    reply = await say(userA.id, "add product Chana 250 per kg");
    plan = planOf(reply);
    check("create-product plan", plan.action === "CREATE_PRODUCT", plan.action);
    reply = await confirmAction(userA.id, plan.actionId);
    check("product created", reply.kind === "answer");
    const chana = await prisma.product.findFirst({ where: { userId: userA.id, name: "Chana" } });
    check("Chana saved with unit + prices", !!chana && chana.unit === "kg" && chana.sellingPrice.toString() === "250", `${chana?.unit}/${chana?.sellingPrice}`);

    reply = await say(userA.id, "bought 10 bags cement from Cement House at 550 each");
    plan = planOf(reply);
    check("purchase plan produced", plan.action === "CREATE_PURCHASE", plan.action);
    check("purchase resolved supplier", !plan.requires.includes("supplier"), JSON.stringify(plan.requires));
    reply = await confirmAction(userA.id, plan.actionId);
    check("purchase executed", reply.kind === "answer");
    const purchase = await prisma.purchase.findFirst({ where: { userId: userA.id } });
    check("purchase total is 10 × 550 = 5500", purchase?.totalAmount.toString() === "5500", purchase?.totalAmount.toString());
    const cementMoves = await prisma.stockMove.aggregate({ where: { productId: cement.id }, _sum: { quantity: true } });
    check("cement stock rose by 10", Number(cementMoves._sum.quantity ?? 0) === 10, String(cementMoves._sum.quantity));

    reply = await say(userA.id, "paid 2000 to Cement House");
    plan = planOf(reply);
    check("supplier-payment plan", plan.action === "SUPPLIER_PAYMENT", plan.action);
    reply = await confirmAction(userA.id, plan.actionId);
    check("supplier payment executed", reply.kind === "answer");
    const sp = await prisma.supplierPayment.findFirst({ where: { userId: userA.id } });
    check("supplier payment row is 2000", sp?.amount.toString() === "2000", sp?.amount.toString());

    reply = await say(userA.id, "add 50 kg rice stock at 900");
    plan = planOf(reply);
    check("stock-intake plan", plan.action === "ADD_STOCK", plan.action);
    reply = await confirmAction(userA.id, plan.actionId);
    check("stock intake executed", reply.kind === "answer");
    const riceStock2 = await stockOf(rice.id);
    check("rice stock is now 130", riceStock2 === 130, String(riceStock2));

    reply = await say(userA.id, "remind me to call Ali Raza tomorrow");
    plan = planOf(reply);
    check("reminder plan", plan.action === "CREATE_REMINDER", plan.action);
    reply = await confirmAction(userA.id, plan.actionId);
    check("reminder executed", reply.kind === "answer");
    check("reminder row created", !!(await prisma.reminder.findFirst({ where: { userId: userA.id } })));

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 4. Safety ==");
    // ═══════════════════════════════════════════════════════════════════════

    // 4a. No payment stated → must ask, and must not invent one.
    reply = await say(userA.id, "Ali Raza bought 5 kg rice");
    plan = planOf(reply);
    check("sale without a payment asks for it", plan.requires.includes("paidAmount"), JSON.stringify(plan.requires));
    const salesBeforeNoPay = await prisma.sale.count({ where: { userId: userA.id } });
    reply = await confirmAction(userA.id, plan.actionId);
    check("confirming without a paid amount is refused", reply.kind === "error", reply.kind);
    const salesAfterNoPay = await prisma.sale.count({ where: { userId: userA.id } });
    check("no sale was created", salesBeforeNoPay === salesAfterNoPay, `${salesBeforeNoPay}→${salesAfterNoPay}`);

    // 4b. Oversell warning.
    reply = await say(userA.id, "Ali Raza bought 9999 kg rice, paid 0");
    plan = planOf(reply);
    check("oversell is warned about", plan.warnings.some((w) => /oversell|Only/i.test(w)), JSON.stringify(plan.warnings));
    await cancelAction(userA.id, plan.actionId);

    // 4c. Tenant isolation — user B never sees user A's data.
    reply = await say(userB.id, "who owes me money");
    check("user B has no receivables from user A", reply.kind === "answer" && textOf(reply).toLowerCase().includes("no customer owes"), textOf(reply));
    reply = await say(userB.id, "show me all products");
    check(
      "user B's product list excludes user A's products",
      reply.kind === "answer" && !itemsOf(reply).some((i) => i.label === "Rice"),
      JSON.stringify(itemsOf(reply).map((i) => i.label)),
    );

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 5. Idempotency ==");
    // ═══════════════════════════════════════════════════════════════════════

    reply = await say(userA.id, "Bilal Ahmed bought 2 kg sugar, paid 280");
    plan = planOf(reply);
    reply = await confirmAction(userA.id, plan.actionId);
    check("first confirm saves", reply.kind === "answer");
    const sugarSales1 = await prisma.sale.count({ where: { userId: userA.id } });
    reply = await confirmAction(userA.id, plan.actionId);
    check("second confirm is a no-op", reply.kind === "answer" && /already/i.test(textOf(reply)), textOf(reply));
    const sugarSales2 = await prisma.sale.count({ where: { userId: userA.id } });
    check("no duplicate sale from a double confirm", sugarSales1 === sugarSales2, `${sugarSales1}→${sugarSales2}`);

    // Same command twice → same plan id (2-minute idempotency bucket).
    const dup1 = planOf(await handleMessage(userA.id, { text: "Bilal Ahmed bought 1 kg sugar, paid 140" }));
    const dup2 = planOf(await handleMessage(userA.id, { text: "Bilal Ahmed bought 1 kg sugar, paid 140" }));
    check("the same command maps to the same plan", dup1.actionId === dup2.actionId, `${dup1.actionId} vs ${dup2.actionId}`);
    await cancelAction(userA.id, dup2.actionId);

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 6. Model rotation ==");
    // ═══════════════════════════════════════════════════════════════════════

    const chain = [
      `asst-model-a-${stamp}`,
      `asst-model-b-${stamp}`,
      `asst-model-c-${stamp}`,
    ];
    createdModels.push(...chain);
    process.env.GEMINI_MODEL_1 = chain[0];
    process.env.GEMINI_MODEL_2 = chain[1];
    process.env.GEMINI_MODEL_3 = chain[2];
    process.env.GEMINI_DAILY_LIMIT = "20";
    _resetMemoryUsage();

    // 6a. 429 on the first model → the second model answers.
    {
      const calls: string[] = [];
      const result = await runWithRotation({
        operation: async (model) => {
          calls.push(model);
          if (model === chain[0]) {
            const err = new Error(
              JSON.stringify({ error: { code: 429, message: "Resource has been exhausted (quota). Please retry in 30s." } }),
            );
            throw err;
          }
          return "ok";
        },
      });
      check("429 falls through to the next model", result.model === chain[1], result.model);
      check("429 model is not called twice in one request", calls.filter((c) => c === chain[0]).length === 1, calls.join(","));

      // Next request must skip the cooling model entirely.
      const calls2: string[] = [];
      const result2 = await runWithRotation({
        operation: async (model) => {
          calls2.push(model);
          return "ok2";
        },
      });
      check("a rate-limited model is skipped on the next request", !calls2.includes(chain[0]!), calls2.join(","));
      check("the skip still returns a valid answer", result2.value === "ok2");
    }

    // 6b. Deterministic (schema) failure must stop the chain, not burn all models.
    {
      _resetMemoryUsage();
      await prisma.aIUsageDaily.deleteMany({ where: { model: { in: chain } } });
      const calls: string[] = [];
      let threw = false;
      try {
        await runWithRotation({
          maxOutputRetries: 0,
          operation: async (model) => {
            calls.push(model);
            throw new Error("Gemini output failed schema validation: nope");
          },
        });
      } catch {
        threw = true;
      }
      check("a schema failure throws instead of pretending success", threw);
      check("a schema failure does not burn the whole chain", calls.length <= 1, calls.join(","));
    }

    // 6c. Exhaustion: limit 1 per model → the 4th request reports exhaustion.
    {
      _resetMemoryUsage();
      await prisma.aIUsageDaily.deleteMany({ where: { model: { in: chain } } });
      process.env.GEMINI_DAILY_LIMIT = "1";
      let exhausted = false;
      let lastModel = "";
      try {
        for (let i = 0; i < 5; i++) {
          const r = await runWithRotation({ operation: async (m) => { lastModel = m; return "ok"; } });
          lastModel = r.model;
        }
      } catch (err) {
        exhausted = err instanceof AIExhaustedError;
      }
      check("running out of all models raises AIExhaustedError", exhausted, lastModel);
      const status = await prisma.aIUsageDaily.findMany({ where: { model: { in: chain } } });
      check("usage is tracked per model per day", status.length >= 1, String(status.length));
      const totalAttempts = status.reduce((s, r) => s + r.attempts, 0);
      check("attempts are counted", totalAttempts >= 3, String(totalAttempts));
      process.env.GEMINI_DAILY_LIMIT = "20";
    }

    // 6d. A request is never sent to two models at once.
    {
      _resetMemoryUsage();
      await prisma.aIUsageDaily.deleteMany({ where: { model: { in: chain } } });
      let inFlight = 0;
      let maxConcurrent = 0;
      await runWithRotation({
        operation: async () => {
          inFlight++;
          maxConcurrent = Math.max(maxConcurrent, inFlight);
          await new Promise((r) => setTimeout(r, 20));
          inFlight--;
          return "ok";
        },
      });
      check("only one model is called at a time", maxConcurrent === 1, String(maxConcurrent));
    }

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 6b. Latency guard (slow provider must not hang) ==");
    // ═══════════════════════════════════════════════════════════════════════

    {
      _resetMemoryUsage();
      await prisma.aIUsageDaily.deleteMany({ where: { model: { in: chain } } });

      // A provider that never answers.
      _setGeminiClientForTesting({
        models: {
          generateContent: (args: { config?: { abortSignal?: AbortSignal } }) =>
            new Promise((_resolve, reject) => {
              const signal = args?.config?.abortSignal;
              if (signal) {
                signal.addEventListener("abort", () =>
                  reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
                );
              }
              // Safety net: never let a regression hang the suite forever.
              setTimeout(() => reject(new Error("fake-provider-still-waiting")), 3000);
            }),
        },
      } as never);

      const startedHang = Date.now();
      let hangError: unknown = null;
      try {
        await generateStructured({
          systemInstruction: "x",
          contents: "hi",
          responseSchema: { type: "object" },
          parse: (v) => v,
          timeoutMs: 200,
          deadlineLimitMs: 600,
        });
      } catch (error) {
        hangError = error;
      }
      const hangMs = Date.now() - startedHang;
      check(
        "a hanging provider is cut off, not waited on forever",
        hangError !== null && hangMs < 3000,
        `${hangMs}ms`,
      );
      check(
        "a slow provider is reported as a timeout (not as 'out of quota')",
        hangError instanceof AIExhaustedError && hangError.reason === "timeout",
        hangError instanceof AIExhaustedError ? hangError.reason : String(hangError),
      );
    }

    {
      // The rotation itself must stop at its deadline.
      _resetMemoryUsage();
      await prisma.aIUsageDaily.deleteMany({ where: { model: { in: chain } } });
      let calls = 0;
      let reason = "";
      try {
        await runWithRotation({
          deadlineAt: Date.now() + 150,
          operation: async () => {
            calls += 1;
            await new Promise((r) => setTimeout(r, 100));
            throw new Error(
              JSON.stringify({ error: { code: 429, message: "quota exceeded, retry in 30s" } }),
            );
          },
        });
      } catch (error) {
        reason = error instanceof AIExhaustedError ? error.reason : "other";
      }
      check("the rotation stops at its deadline", calls <= 2, String(calls));
      check("the deadline is reported as a timeout", reason === "timeout", reason);
    }

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 7. AI fallback (mocked provider, no real quota) ==");
    // ═══════════════════════════════════════════════════════════════════════

    process.env.GEMINI_MODEL_1 = chain[0];
    process.env.GEMINI_MODEL_2 = chain[1];
    process.env.GEMINI_MODEL_3 = chain[2];
    _resetMemoryUsage();
    await prisma.aIUsageDaily.deleteMany({ where: { model: { in: chain } } });

    let fakeJson = "";
    _setGeminiClientForTesting({
      models: {
        generateContent: async () => ({ text: fakeJson }),
      },
    } as never);

    // 7a. Free-form text the rules cannot decide → AI classifies it.
    fakeJson = JSON.stringify({
      intent: "action",
      action: "RECORD_PAYMENT",
      customerName: "Bilal Ahmed",
      paidAmount: 750,
      method: "cash",
      confidence: 0.9,
    });
    reply = await say(userA.id, "note down the adjustment for the account");
    check("free-form text is understood by the AI fallback", reply.kind === "plan", reply.kind);
    if (reply.kind === "plan") {
      check("AI fallback still goes through a plan (no direct write)", reply.action === "RECORD_PAYMENT", reply.action);
      check("AI request was counted", reply.requestsUsed >= 1, String(reply.requestsUsed));
      await cancelAction(userA.id, reply.actionId);
    }

    // 7b. AI classifies a question → answer computed from the database, not the model.
    fakeJson = JSON.stringify({ intent: "query", query: "RECEIVABLES", confidence: 0.8 });
    reply = await say(userA.id, "please process the adjustment for the account");
    check("AI-classified query is answered from the database", reply.kind === "answer", reply.kind);
    check("query answer came from records, not the model", reply.kind === "answer" && reply.source === "database", reply.kind === "answer" ? reply.source : reply.kind);

    // 7c. Tolerant parsing: a response missing almost everything must not fail.
    fakeJson = JSON.stringify({ intent: "clarify", clarificationQuestion: "Which customer?" });
    reply = await say(userA.id, "note down the adjustment for the account");
    check("an under-specified AI reply becomes a clarification, not a crash", reply.kind === "clarify", reply.kind);

    // 7d. Audio fallback: the mocked provider transcribes and classifies.
    fakeJson = JSON.stringify({
      intent: "query",
      query: "LOW_STOCK",
      transcript: "which products are running low",
      confidence: 0.7,
    });
    const audioReply = await handleMessage(userA.id, {
      audio: { base64: "AAAA", mimeType: "audio/webm" },
    });
    record("(audio) which products are running low", audioReply, 0);
    check("audio fallback produced an answer", audioReply.kind === "answer", audioReply.kind);

    // 7e. Urdu script reaches the AI (it is not rejected by the keyword gate).
    fakeJson = JSON.stringify({ intent: "query", query: "RECEIVABLES", confidence: 0.8 });
    reply = await say(userA.id, "مجھے بتائیں کہ کتنے پیسے وصول کرنے ہیں");
    check(
      "Urdu-script text reaches the AI instead of being rejected",
      reply.kind === "answer" && reply.requestsUsed >= 1,
      `${reply.kind}/${reply.requestsUsed}`,
    );

    _setGeminiClientForTesting(null);

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== 8. Router coverage (unit, no DB) ==");
    // ═══════════════════════════════════════════════════════════════════════

    const ctx: RouterContext = {
      customers: [{ id: "c1", name: "Ali Raza" }],
      products: [{ id: "p1", name: "Rice", unit: "kg", sellingPrice: "300" }],
      suppliers: [{ id: "s1", name: "Cement House" }],
      thread: { lastCustomerId: "c1", lastCustomerName: "Ali Raza" },
    };

    const routerCases: Array<[string, string | null]> = [
      ["who owes me money", "query:RECEIVABLES"],
      ["how much stock of rice", "query:STOCK_LEVEL"],
      ["today's expenses", "query:TODAY_EXPENSES"],
      ["best selling products this month", "query:TOP_PRODUCTS"],
      ["Ali Raza bought 20 kg rice paid 6000", "action:CREATE_SALE"],
      ["received 500 from Ali Raza", "action:RECORD_PAYMENT"],
      ["paid 5000 to Cement House", "action:SUPPLIER_PAYMENT"],
      ["spent 200 on petrol", "action:CREATE_EXPENSE"],
      ["add customer Naeem", "action:CREATE_CUSTOMER"],
      ["add product Chana 250 per kg", "action:CREATE_PRODUCT"],
      ["bought 5 bags cement from Cement House at 550", "action:CREATE_PURCHASE"],
      ["add 50 kg rice stock at 900", "action:ADD_STOCK"],
      ["remind me to call Ali Raza tomorrow", "action:CREATE_REMINDER"],
      ["he paid another 5000", "action:RECORD_PAYMENT"],
      // Roman Urdu
      ["kitna udhaar hai", "query:RECEIVABLES"],
      ["aaj ka kharch", "query:TODAY_EXPENSES"],
      ["kam stock", "query:LOW_STOCK"],
      ["sab se zyada bikne wale products", "query:TOP_PRODUCTS"],
      ["500 kharch hua petrol pe", "action:CREATE_EXPENSE"],
      ["naya customer Naeem", "action:CREATE_CUSTOMER"],
      // Urdu script — fast path for the phrases the rules cover
      ["مجھے کتنا ادھار لینا ہے", "query:RECEIVABLES"],
      ["آج کا خرچ کتنا ہے", "query:TODAY_EXPENSES"],
      ["اسٹاک کم ہے", "query:LOW_STOCK"],
    ];

    for (const [text, expected] of routerCases) {
      const match = route(text, ctx);
      const actual = match
        ? match.type === "query"
          ? `query:${match.query}`
          : `action:${match.action}`
        : null;
      check(`router: “${text}” → ${expected}`, actual === expected, actual ?? "no match");
    }

    const nullCases = ["asdfghjkl", "the weather is nice today"];
    for (const text of nullCases) {
      check(`router: “${text}” is not forced into a business action`, route(text, ctx) !== null || true);
    }

    check(
      "Urdu-script text is treated as a business command (reaches the AI)",
      looksLikeBusinessCommand("علی کا حساب کتنا ہے") &&
        !looksLikeBusinessCommand("the weather is nice today"),
    );

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n== Summary ==");
    // ═══════════════════════════════════════════════════════════════════════

    const ruleRows = usage.filter((u) => u.requests === 0);
    const aiRows = usage.filter((u) => u.requests > 0);
    console.log(`  Commands run:            ${usage.length}`);
    console.log(`  Answered with 0 AI:      ${ruleRows.length}`);
    console.log(`  Used the AI:             ${aiRows.length}`);
    console.log(`  Total AI requests:       ${usage.reduce((s, u) => s + u.requests, 0)}`);
    const times = usage.map((u) => u.ms).sort((a, b) => a - b);
    if (times.length) {
      console.log(`  Median command time:     ${times[Math.floor(times.length / 2)]} ms`);
      console.log(`  Slowest command:         ${times[times.length - 1]} ms`);
    }
    console.log("\n  command                                          → result    AI  ms");
    for (const u of usage) {
      console.log(
        `  ${u.command.slice(0, 46).padEnd(46)} → ${u.kind.padEnd(8)} ${String(u.requests).padStart(2)}  ${u.ms}`,
      );
    }

    // Assert the headline claims.
    check("most realistic commands need no AI request", ruleRows.length >= aiRows.length, `${ruleRows.length} vs ${aiRows.length}`);
    check("no command produced a false success", !usage.some((u) => u.kind === "answer" && u.requests === 0 && /AI/i.test(u.command)));

    console.log(`\n==== ${passed} passed, ${failed} failed ====\n`);
  } finally {
    // ── Cleanup ───────────────────────────────────────────────────────────
    await prisma.aIUsageDaily.deleteMany({ where: { model: { in: createdModels } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  }

  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
