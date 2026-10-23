/**
 * Verifies sale due dates and overdue tracking against a real DB.
 *
 * What must be true:
 *   - A due date is stored as midnight in the business timezone, so "due today"
 *     means today and is not overdue until tomorrow.
 *   - Overdue = money still owed AND the due date has passed. Fully paid sales,
 *     voided sales and sales with no agreed date are never overdue.
 *   - Insights, reports and the sales list all agree on the same overdue total.
 *   - One business never sees another business's overdue money.
 *
 * Run: npx tsx scripts/verify-due-dates.ts
 */

import { prisma } from "@/lib/db/prisma";
import {
  createSale,
  voidSale,
  listSales,
  getOverdueSummary,
  computeIsOverdue,
} from "@/lib/services/sales";
import { getBusinessInsights } from "@/lib/services/insights";
import { getReportForRange } from "@/lib/services/reports";
import {
  dateStringInTz,
  startOfDayInTz,
  todayDateStringInTz,
} from "@/lib/utils/date";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

async function expectFailure(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "expected an error but it succeeded");
  } catch {
    check(label, true);
  }
}

const TZ = "Asia/Karachi";

async function main() {
  const stamp = Date.now();
  const today = todayDateStringInTz(TZ);
  const yesterday = dateStringInTz(new Date(Date.now() - 86_400_000), TZ);
  const tomorrow = dateStringInTz(new Date(Date.now() + 86_400_000), TZ);
  const fiveDaysAgo = dateStringInTz(new Date(Date.now() - 5 * 86_400_000), TZ);

  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "Due Test A", email: `da_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Due Test B", email: `db_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const productA = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Due Test Item",
        sku: `DUE-${stamp}`,
        unit: "piece",
        purchasePrice: 100,
        sellingPrice: 150,
        openingStock: 100,
      },
    });
    const customerA = await prisma.customer.create({
      data: { userId: userA.id, name: "Overdue Customer" },
    });
    const customerB = await prisma.customer.create({
      data: { userId: userA.id, name: "Second Overdue" },
    });
    const productB = await prisma.product.create({
      data: {
        userId: userB.id,
        name: "Foreign Due Item",
        sku: `FOREIGN-DUE-${stamp}`,
        unit: "piece",
        purchasePrice: 10,
        sellingPrice: 20,
      },
    });
    const customerForeign = await prisma.customer.create({
      data: { userId: userB.id, name: "Foreign Debtor" },
    });

    async function makeSale(
      customerId: string,
      productId: string,
      total: number,
      paid: number,
      dueDate: string | null,
    ) {
      return createSale(
        {
          customerId,
          items: [{ productId, quantity: 1, unitPrice: total }],
          paidAmount: paid,
          dueDate,
        },
        productId === productB.id ? userB.id : userA.id,
      );
    }

    // 1. Past due, unpaid → overdue.
    const s1 = await makeSale(customerA.id, productA.id, 1000, 0, yesterday);
    // 2. Due today, unpaid → not overdue yet.
    const s2 = await makeSale(customerA.id, productA.id, 500, 0, today);
    // 3. Due tomorrow → not overdue.
    const s3 = await makeSale(customerA.id, productA.id, 700, 0, tomorrow);
    // 4. Past due but fully paid → not overdue.
    const s4 = await makeSale(customerA.id, productA.id, 300, 300, yesterday);
    // 5. Past due then voided → never counted.
    const s5 = await makeSale(customerA.id, productA.id, 400, 0, yesterday);
    await voidSale(s5.id, userA.id);
    // 6. No agreed date → not overdue.
    const s6 = await makeSale(customerA.id, productA.id, 200, 0, null);
    // 7. Partly paid and five days late → the outstanding part is overdue.
    const s7 = await makeSale(customerB.id, productA.id, 600, 100, fiveDaysAgo);
    // 8. Another tenant's overdue sale must never leak.
    await makeSale(customerForeign.id, productB.id, 999, 0, yesterday);

    // ── Stored shape ─────────────────────────────────────────────────────
    console.log("\n== Stored due date ==");
    const storedS1 = await prisma.sale.findUnique({ where: { id: s1.id } });
    const expectedMidnight = startOfDayInTz(yesterday, TZ);
    check(
      "due date is stored as midnight in the business timezone",
      !!storedS1?.dueDate &&
        !!expectedMidnight &&
        storedS1.dueDate.getTime() === expectedMidnight.getTime(),
      storedS1?.dueDate?.toISOString(),
    );
    check("sale without a due date stores null", (await prisma.sale.findUnique({ where: { id: s6.id } }))?.dueDate === null);

    // ── Overdue flags ────────────────────────────────────────────────────
    console.log("\n== Overdue flags ==");
    check("past due + unpaid is overdue", s1.isOverdue);
    check("due today is not overdue", !s2.isOverdue);
    check("due tomorrow is not overdue", !s3.isOverdue);
    check("fully paid is never overdue", !s4.isOverdue);
    check("no due date is never overdue", !s6.isOverdue);
    check("partly paid + late is overdue", s7.isOverdue);
    check("overdue outstanding is the unpaid part only", Number(s7.outstanding) === 500, s7.outstanding);

    // ── Pure rule ────────────────────────────────────────────────────────
    console.log("\n== Overdue rule ==");
    const past = startOfDayInTz(yesterday, TZ);
    const todayMidnight = startOfDayInTz(today, TZ);
    check("computeIsOverdue: past + owed", computeIsOverdue("10", past));
    check("computeIsOverdue: past + paid", !computeIsOverdue("0", past));
    check("computeIsOverdue: due today + owed", !computeIsOverdue("10", todayMidnight));
    check("computeIsOverdue: no date", !computeIsOverdue("10", null));

    // ── Shared summary ───────────────────────────────────────────────────
    console.log("\n== Shared overdue summary ==");
    const summary = await getOverdueSummary(userA.id);
    check("overdue total is 1,500", Number(summary.total) === 1500, summary.total);
    check("two sales are overdue", summary.salesCount === 2, String(summary.salesCount));
    check("two customers are overdue", summary.customersCount === 2, String(summary.customersCount));

    const foreignSummary = await getOverdueSummary(userB.id);
    check("other tenant sees only its own overdue", Number(foreignSummary.total) === 999, foreignSummary.total);

    // ── Insights agree ───────────────────────────────────────────────────
    console.log("\n== Insights ==");
    const insights = await getBusinessInsights(userA.id);
    check("insights overdue total matches", insights.overdue.total === summary.total, insights.overdue.total);
    check("insights overdue sales count matches", insights.overdue.salesCount === 2);
    check("insights overdue customers count matches", insights.overdue.customersCount === 2);

    // ── Reports agree ────────────────────────────────────────────────────
    console.log("\n== Reports ==");
    const report = await getReportForRange(userA.id, today, today, TZ);
    check("report overdue total matches", report.position.overdue === summary.total, report.position.overdue);
    check("report overdue sales count matches", report.position.overdueSalesCount === 2);
    check("report overdue customers count matches", report.position.overdueCustomersCount === 2);

    // ── Sales list ───────────────────────────────────────────────────────
    console.log("\n== Sales list ==");
    const list = await listSales(50, userA.id);
    const listed = new Map(list.map((s) => [s.id, s]));
    check("sales list marks the overdue sale", listed.get(s1.id)?.isOverdue === true);
    check("sales list does not mark the today sale", listed.get(s2.id)?.isOverdue === false);
    check("voided sale is absent from the sales list", !listed.has(s5.id));
    check("sales list keeps the due date", !!listed.get(s3.id)?.dueDate);

    // ── Validation ───────────────────────────────────────────────────────
    console.log("\n== Validation ==");
    await expectFailure("a nonsense due date is rejected", async () =>
      makeSale(customerA.id, productA.id, 100, 0, "not-a-date"),
    );
    await expectFailure("an impossible calendar date is rejected", async () =>
      makeSale(customerA.id, productA.id, 100, 0, "2026-02-31"),
    );

    // ── Cleanup ──────────────────────────────────────────────────────────
    console.log("\n== Cleanup ==");
    await prisma.transaction.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.payment.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.saleItem.deleteMany({ where: { sale: { userId: { in: [userA.id, userB.id] } } } });
    await prisma.sale.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.product.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.customer.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    check("test data cleaned up", true);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
