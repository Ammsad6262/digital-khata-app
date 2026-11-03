/**
 * Khata Assistant — acceptance test.
 *
 * Seeds a throwaway tenant with known sales, payments and expenses, then runs
 * all 20 prepared questions through the REAL service and verifies the answers
 * against the records (and against the same report/P&L services the screens
 * use). Also checks:
 *
 *   - exactly 20 questions in 5 categories;
 *   - empty tenants get honest "no data" answers (no invented rows);
 *   - another tenant can never see this tenant's customers;
 *   - the feature never writes (asking it to add a customer changes nothing);
 *   - custom questions route in English / Roman Urdu / Urdu;
 *   - no developer details (model names, quotas) appear in a reply.
 *
 * Run: npx tsx scripts/test-khata-assistant.ts
 */

import { prisma } from "@/lib/db/prisma";
import {
  askKhataAssistant,
  getKhataCatalog,
} from "@/lib/khata-assistant/service";
import { detectActionRequest, matchCustomQuestion } from "@/lib/khata-assistant/match";
import { PREPARED_QUESTIONS } from "@/lib/khata-assistant/questions";
import type { KhataAnswer, KhataQuestionId } from "@/lib/khata-assistant/types";
import { detectSpeechLanguage } from "@/lib/assistant/language";
import { startOfMonthInTz } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { getReportForPreset } from "@/lib/services/reports";
import { getBusinessInsights } from "@/lib/services/insights";

const TZ = "Asia/Karachi";
const SYMBOL = "Rs.";
const DAY = 86_400_000;

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

function money(value: string | number): string {
  return formatMoney(value, SYMBOL);
}

type Seed = {
  userId: string;
  ali: string;
  bilal: string;
  sana: string;
  kareem: string;
  nadia: string;
};

async function createSale(input: {
  userId: string;
  customerId: string;
  date: Date;
  dueDate?: Date | null;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  paid: number;
}) {
  const total = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const sale = await prisma.sale.create({
    data: {
      userId: input.userId,
      customerId: input.customerId,
      totalAmount: total,
      paidAmount: input.paid,
      outstanding: total - input.paid,
      discountAmount: 0,
      date: input.date,
      dueDate: input.dueDate ?? null,
      items: {
        create: input.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.quantity * i.unitPrice,
        })),
      },
    },
  });
  if (input.paid > 0) {
    await prisma.payment.create({
      data: {
        userId: input.userId,
        customerId: input.customerId,
        saleId: sale.id,
        amount: input.paid,
        method: "cash",
        date: input.date,
      },
    });
  }
  return sale;
}

async function seedTenant(userId: string): Promise<Seed> {
  const customer = (name: string, phone: string) =>
    prisma.customer.create({ data: { userId, name, phone } });

  const ali = await customer("Ali Raza", "03001111111");
  const bilal = await customer("Bilal Ahmed", "03002222222");
  const sana = await customer("Sana Traders", "03003333333");
  const kareem = await customer("Kareem Store", "03004444444");
  const nadia = await customer("Nadia Mart", "03005555555");

  const product = (
    name: string,
    unit: string,
    purchasePrice: number,
    sellingPrice: number,
    openingStock: number,
    lowStockThreshold: number,
  ) =>
    prisma.product.create({
      data: {
        userId,
        name,
        unit,
        purchasePrice,
        sellingPrice,
        openingStock,
        lowStockThreshold,
      },
    });

  const rice = await product("Rice", "kg", 250, 300, 100, 5);
  const basmati = await product("Basmati", "kg", 200, 260, 10, 3);
  const sugar = await product("Sugar", "kg", 100, 120, 2, 5);
  const oil = await product("Cooking Oil", "litre", 500, 600, 0, 3);
  const salt = await product("Salt", "kg", 50, 70, 20, 2);

  const now = new Date();
  const yesterday = new Date(now.getTime() - DAY);
  const monthStart = startOfMonthInTz(TZ);
  const lastMonthDate = new Date(monthStart.getTime() - 5 * DAY);
  const oldDate = new Date(now.getTime() - 90 * DAY);
  const oldDue = new Date(now.getTime() - 60 * DAY);
  const repeatDate = new Date(now.getTime() - 25 * DAY);

  // Today: 3,000 billed / 1,000 received, overdue.
  await createSale({
    userId,
    customerId: ali.id,
    date: now,
    dueDate: yesterday,
    items: [{ productId: rice.id, quantity: 10, unitPrice: 300 }],
    paid: 1000,
  });

  // Today: 1,500 billed and fully paid.
  await createSale({
    userId,
    customerId: bilal.id,
    date: now,
    items: [{ productId: rice.id, quantity: 5, unitPrice: 300 }],
    paid: 1500,
  });

  // Last month: 520 billed, unpaid (not overdue — no due date).
  await createSale({
    userId,
    customerId: sana.id,
    date: lastMonthDate,
    items: [{ productId: basmati.id, quantity: 2, unitPrice: 260 }],
    paid: 0,
  });

  // 90 days ago: 300 unpaid, long overdue -> inactive + overdue.
  await createSale({
    userId,
    customerId: kareem.id,
    date: oldDate,
    dueDate: oldDue,
    items: [{ productId: rice.id, quantity: 1, unitPrice: 300 }],
    paid: 0,
  });

  // 25 days ago: 260 fully paid -> repeat-order candidate, not inactive.
  await createSale({
    userId,
    customerId: nadia.id,
    date: repeatDate,
    items: [{ productId: basmati.id, quantity: 1, unitPrice: 260 }],
    paid: 260,
  });

  // Expenses: this month 2,500; last month 300 (must be excluded).
  await prisma.expense.createMany({
    data: [
      { userId, name: "Shop rent", amount: 2000, category: "rent", date: now },
      { userId, name: "Electricity", amount: 500, category: "electricity", date: now },
      { userId, name: "Transport", amount: 300, category: "transport", date: lastMonthDate },
    ],
  });

  return {
    userId,
    ali: ali.id,
    bilal: bilal.id,
    sana: sana.id,
    kareem: kareem.id,
    nadia: nadia.id,
  };
}

async function answer(
  userId: string,
  questionId: KhataQuestionId,
  language: "en" | "ur" | "roman-ur" = "en",
): Promise<KhataAnswer> {
  const reply = await askKhataAssistant(
    userId,
    { questionId, language },
    { useAi: false },
  );
  if (reply.kind !== "answer") {
    throw new Error(`${questionId} returned ${reply.kind}: ${JSON.stringify(reply)}`);
  }
  return reply;
}

async function main() {
  const stamp = Date.now();
  const userA = await prisma.user.create({
    data: { name: "Khata BI A", email: `khata_a_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Khata BI B", email: `khata_b_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const seed = await seedTenant(userA.id);
    const answers: Partial<Record<KhataQuestionId, KhataAnswer>> = {};
    const timings: number[] = [];

    console.log("\n── Catalogue ─────────────────────────────────────────────");
    const catalog = getKhataCatalog("en");
    const total = catalog.categories.reduce((n, c) => n + c.questions.length, 0);
    check("exactly 20 prepared questions", total === 20, String(total));
    check("exactly 5 categories", catalog.categories.length === 5);
    check(
      "every prepared question has an id and label",
      PREPARED_QUESTIONS.every((q) => q.id.length > 0 && q.labels.en.length > 0),
    );
    check(
      "no duplicate question ids",
      new Set(PREPARED_QUESTIONS.map((q) => q.id)).size === PREPARED_QUESTIONS.length,
    );

    console.log("\n── All 20 questions return a real answer ──────────────────");
    for (const q of PREPARED_QUESTIONS) {
      const started = Date.now();
      const reply = await askKhataAssistant(
        userA.id,
        { questionId: q.id, language: "en" },
        { useAi: false },
      );
      timings.push(Date.now() - started);
      check(`${q.id}: answer`, reply.kind === "answer");
      if (reply.kind === "answer") {
        answers[q.id] = reply;
        check(`${q.id}: has a headline`, reply.headline.trim().length > 0);
        check(`${q.id}: questionId matches`, reply.questionId === q.id);
        check(
          `${q.id}: no developer details`,
          !/gemini|api[\s-_]?key|requestsUsed|\bmodel\b/i.test(JSON.stringify(reply)),
        );
      }
    }

    console.log("\n── Calculations against the seed ─────────────────────────");
    const reportMonth = await getReportForPreset(userA.id, "month", TZ);
    const reportToday = await getReportForPreset(userA.id, "today", TZ);
    const insights = await getBusinessInsights(userA.id);

    check(
      "sales_today billed matches the today report",
      answers.sales_today?.figures[1]?.value === money(reportToday.sales.billed),
      `${answers.sales_today?.figures[1]?.value}`,
    );
    check(
      "sales_today cash matches the today report",
      answers.sales_today?.figures[0]?.value === money(reportToday.sales.cashReceived),
    );
    check(
      "sales_month billed matches the month report",
      answers.sales_month?.figures[0]?.value === money(reportMonth.sales.billed),
    );
    check(
      "sales_trend this-month matches insights",
      answers.sales_trend?.figures[3]?.value === money(insights.salesTrend.thisMonth),
    );

    check(
      "top_selling_products ranks Rice first by quantity",
      answers.top_selling_products?.rows[0]?.label === "Rice",
      answers.top_selling_products?.rows[0]?.label,
    );
    check(
      "top_selling_products shows 15 kg of Rice",
      answers.top_selling_products?.rows[0]?.value === "15 kg",
      answers.top_selling_products?.rows[0]?.value,
    );
    check(
      "top_customers ranks Ali Raza first",
      answers.top_customers?.rows[0]?.label === "Ali Raza",
      answers.top_customers?.rows[0]?.label,
    );

    check(
      "top_debtors total is Rs. 2,820.00",
      answers.top_debtors?.figures[0]?.value === money(2820),
      answers.top_debtors?.figures[0]?.value,
    );
    check(
      "top_debtors ranks Ali Raza first",
      answers.top_debtors?.rows[0]?.label === "Ali Raza",
    );
    check(
      "total_receivables is Rs. 2,820.00",
      answers.total_receivables?.figures[0]?.value === money(2820),
    );
    check(
      "total_receivables overdue is Rs. 2,300.00",
      answers.total_receivables?.figures[2]?.value === money(2300),
    );
    check(
      "overdue_customers names Ali and Kareem",
      ["Ali Raza", "Kareem Store"].every((name) =>
        answers.overdue_customers?.rows.some((r) => r.label === name),
      ),
    );
    check(
      "inactive_customers includes Kareem",
      answers.inactive_customers?.rows.some((r) => r.label === "Kareem Store"),
    );
    check(
      "repeat_order_customers includes Nadia",
      answers.repeat_order_customers?.rows.some((r) => r.label === "Nadia Mart"),
    );

    check(
      "low_stock finds exactly 2 products",
      answers.low_stock?.figures[0]?.value === "2",
      answers.low_stock?.figures[0]?.value,
    );
    check(
      "low_stock includes Sugar and Cooking Oil",
      ["Sugar", "Cooking Oil"].every((name) =>
        answers.low_stock?.rows.some((r) => r.label === name),
      ),
    );
    check(
      "highest_sales_products ranks Rice first",
      answers.highest_sales_products?.rows[0]?.label === "Rice",
      answers.highest_sales_products?.rows[0]?.label,
    );
    check(
      "highest_sales_products shows Rs. 4,500.00 for Rice",
      answers.highest_sales_products?.rows[0]?.value === money(4500),
      answers.highest_sales_products?.rows[0]?.value,
    );
    check(
      "dead_stock includes Salt and Sugar",
      ["Salt", "Sugar"].every((name) =>
        answers.dead_stock?.rows.some((r) => r.label === name),
      ),
    );
    check(
      "dead_stock value is Rs. 1,200.00",
      answers.dead_stock?.figures[1]?.value === money(1200),
      answers.dead_stock?.figures[1]?.value,
    );
    check(
      "inventory_value is Rs. 23,600.00",
      answers.inventory_value?.figures[0]?.value === money(23600),
      answers.inventory_value?.figures[0]?.value,
    );
    check(
      "inventory_value covers 4 products with stock",
      answers.inventory_value?.figures[1]?.value === "4",
      answers.inventory_value?.figures[1]?.value,
    );

    check(
      "expenses_month total is Rs. 2,500.00 (last month excluded)",
      answers.expenses_month?.figures[0]?.value === money(2500),
      answers.expenses_month?.figures[0]?.value,
    );
    check(
      "expenses_month counts 2 expenses",
      answers.expenses_month?.figures[1]?.value === "2",
    );
    check(
      "net_profit_month revenue matches P&L",
      answers.net_profit_month?.figures[0]?.value === money(reportMonth.profit.revenue),
    );
    check(
      "net_profit_month net profit matches P&L",
      answers.net_profit_month?.figures[4]?.value === money(reportMonth.profit.netProfit),
    );
    check(
      "net_profit_month is negative with these expenses",
      Number(reportMonth.profit.netProfit) < 0,
      reportMonth.profit.netProfit,
    );
    check(
      "biggest_expenses ranks rent first at Rs. 2,000.00",
      answers.biggest_expenses?.rows[0]?.label === "rent" &&
        answers.biggest_expenses?.rows[0]?.value === money(2000),
      `${answers.biggest_expenses?.rows[0]?.label} ${answers.biggest_expenses?.rows[0]?.value}`,
    );
    check(
      "cash_vs_sales billed matches the month report",
      answers.cash_vs_sales?.figures[0]?.value === money(reportMonth.sales.billed),
    );
    check(
      "cash_vs_sales cash matches the month report",
      answers.cash_vs_sales?.figures[1]?.value === money(reportMonth.sales.cashReceived),
    );

    check(
      "business_problems finds at least two issues",
      (answers.business_problems?.rows.length ?? 0) >= 2,
      String(answers.business_problems?.rows.length),
    );
    check(
      "business_problems names overdue payments",
      answers.business_problems?.rows.some((r) => /overdue/i.test(r.label)),
    );
    check(
      "improvement_plan suggests at least two steps",
      (answers.improvement_plan?.rows.length ?? 0) >= 2,
      String(answers.improvement_plan?.rows.length),
    );

    console.log("\n── Empty tenant: honest, no invented rows ─────────────────");
    for (const q of PREPARED_QUESTIONS) {
      const reply = await askKhataAssistant(
        userB.id,
        { questionId: q.id, language: "en" },
        { useAi: false },
      );
      check(`empty ${q.id}: answers without error`, reply.kind === "answer");
      if (reply.kind === "answer") {
        check(`empty ${q.id}: marked empty`, reply.empty === true);
        check(`empty ${q.id}: no invented rows`, reply.rows.length === 0, String(reply.rows.length));
        check(`empty ${q.id}: has a headline`, reply.headline.trim().length > 0);
      }
    }

    console.log("\n── Tenant isolation ───────────────────────────────────────");
    const isolated = await answer(userB.id, "top_debtors");
    check("other tenant sees no debtors", isolated.rows.length === 0);
    check(
      "other tenant never sees Ali Raza",
      !JSON.stringify(isolated).includes("Ali Raza"),
    );
    const isolatedTotals = await answer(userB.id, "total_receivables");
    check(
      "other tenant receivables are zero",
      isolatedTotals.figures[0]?.value === money(0),
      isolatedTotals.figures[0]?.value,
    );

    console.log("\n── Read-only guarantee ────────────────────────────────────");
    check("add customer is detected as an action", detectActionRequest("add customer Imran Khan"));
    check(
      "a question is not detected as an action",
      !detectActionRequest("which customers owe me the most"),
    );
    const before = await prisma.customer.count({ where: { userId: userA.id } });
    const actionReply = await askKhataAssistant(
      userA.id,
      { text: "add customer Imran Khan" },
      { useAi: false },
    );
    const after = await prisma.customer.count({ where: { userId: userA.id } });
    check("action request does not create a customer", before === after);
    check(
      "action request points to the Voice Assistant",
      actionReply.kind === "answer" && /voice assistant/i.test(actionReply.headline),
      actionReply.kind === "answer" ? actionReply.headline : actionReply.kind,
    );

    console.log("\n── Custom questions & language ────────────────────────────");
    const routes: Array<[string, string]> = [
      ["why were my sales lower this week", "sales_trend"],
      ["which customers should i follow up with", "repeat_order_customers"],
      ["which products should i purchase again", "low_stock"],
      ["how much money should i collect from customers", "total_receivables"],
      ["compare this month with last month", "compare_periods"],
      ["which customers are becoming inactive", "inactive_customers"],
      ["which customers owe me the most", "top_debtors"],
      ["how much did i spend this month", "expenses_month"],
      ["what is my net profit this month", "net_profit_month"],
      ["kitna udhaar hai", "total_receivables"],
    ];
    for (const [text, expected] of routes) {
      const routed = matchCustomQuestion(text);
      check(`"${text}" → ${expected}`, routed === expected, routed ?? "null");
    }

    check("Urdu script is detected", detectSpeechLanguage("میں نے آج کتنا بیچا") === "ur");
    check(
      "Roman Urdu is detected",
      detectSpeechLanguage("kitna udhaar hai") === "roman-ur",
    );
    const urdu = await answer(userA.id, "sales_today", "ur");
    check("Urdu answer language", urdu.language === "ur");
    check("Urdu answer uses Arabic script", /[\u0600-\u06FF]/.test(urdu.headline));

    const romanReply = await askKhataAssistant(
      userA.id,
      { text: "kitna udhaar hai" },
      { useAi: false },
    );
    check("Roman Urdu custom question answers", romanReply.kind === "answer");
    if (romanReply.kind === "answer") {
      check("Roman Urdu answer language", romanReply.language === "roman-ur");
      check("Roman Urdu answer has content", romanReply.headline.trim().length > 0);
    }

    const unknown = await askKhataAssistant(
      userA.id,
      { text: "tell me a joke about parrots" },
      { useAi: false },
    );
    check("unknown question gets guidance, not an error", unknown.kind === "answer");
    check(
      "guidance invents no figures",
      unknown.kind === "answer" && unknown.figures.length === 0 && unknown.rows.length <= 4,
    );

    console.log("\n── Timings (no AI) ────────────────────────────────────────");
    const sorted = [...timings].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    console.log(`  ${timings.length} answers · median ${median} ms · slowest ${sorted.at(-1) ?? 0} ms`);

    console.log(`\n==== ${passed} passed, ${failed} failed ====\n`);
  } finally {
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