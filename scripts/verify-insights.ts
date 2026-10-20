/**
 * Verifies the Insights engine against real data.
 * Run: npx tsx scripts/verify-insights.ts
 *
 * Creates two throw-away businesses with controlled records and checks every
 * number the insights engine returns. Cleans up afterwards.
 */

import { prisma } from "@/lib/db/prisma";
import { startOfMonthInTz } from "@/lib/utils/date";
import { getBusinessInsights } from "@/lib/services/insights";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const TZ = "Asia/Karachi";

async function main() {
  const stamp = Date.now();
  const now = Date.now();
  const d5 = new Date(now - 5 * 86_400_000);
  const d10 = new Date(now - 10 * 86_400_000);
  const d40 = new Date(now - 40 * 86_400_000);

  const monthStart = startOfMonthInTz(TZ);
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);

  console.log("\n── Setup ──");
  const userA = await prisma.user.create({
    data: { name: "Insights A", email: `ia_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Insights B", email: `ib_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    // Products
    const rice = await prisma.product.create({
      data: { userId: userA.id, name: "Rice", unit: "kg", purchasePrice: 100, sellingPrice: 150, lowStockThreshold: 5 },
    });
    const sugar = await prisma.product.create({
      data: { userId: userA.id, name: "Sugar", unit: "kg", purchasePrice: 50, sellingPrice: 80, lowStockThreshold: 5 },
    });
    const tea = await prisma.product.create({
      data: { userId: userA.id, name: "Old Tea", unit: "box", purchasePrice: 200, sellingPrice: 300, lowStockThreshold: 5 },
    });

    // Stock: Rice 100, Sugar 50, Tea 10 (Tea has never sold)
    for (const [productId, qty, cost] of [
      [rice.id, 100, 100],
      [sugar.id, 50, 50],
      [tea.id, 10, 200],
    ] as const) {
      await prisma.stockMove.create({
        data: {
          userId: userA.id,
          productId,
          type: "purchase",
          quantity: qty,
          remainingQuantity: qty,
          unitCost: cost,
          date: d40,
        },
      });
    }

    // Customers: Ahmed is recent, Quiet only has an opening balance.
    const ahmed = await prisma.customer.create({
      data: { userId: userA.id, name: "Ahmed", openingBalance: 0 },
    });
    const quiet = await prisma.customer.create({
      data: { userId: userA.id, name: "Quiet Trader", openingBalance: 3000 },
    });

    // Sales — within 30 days (count for stock/top products) + one old sale.
    await prisma.sale.create({
      data: {
        userId: userA.id,
        customerId: ahmed.id,
        totalAmount: 1500,
        paidAmount: 0,
        outstanding: 1500,
        date: d5,
        items: {
          create: [{ productId: rice.id, quantity: 10, unitPrice: 150, total: 1500 }],
        },
      },
    });
    await prisma.sale.create({
      data: {
        userId: userA.id,
        customerId: ahmed.id,
        totalAmount: 400,
        paidAmount: 0,
        outstanding: 400,
        date: d10,
        items: {
          create: [{ productId: sugar.id, quantity: 5, unitPrice: 80, total: 400 }],
        },
      },
    });
    // Old sale (outside the 30-day window) — must NOT appear in top products.
    await prisma.sale.create({
      data: {
        userId: userA.id,
        customerId: ahmed.id,
        totalAmount: 3000,
        paidAmount: 0,
        outstanding: 3000,
        date: d40,
        items: {
          create: [{ productId: rice.id, quantity: 20, unitPrice: 150, total: 3000 }],
        },
      },
    });

    // Supplier with opening 500 + purchase outstanding 700 = 1200 payable.
    const supplier = await prisma.supplier.create({
      data: { userId: userA.id, name: "Rice Mill", openingBalance: 500 },
    });
    await prisma.purchase.create({
      data: {
        userId: userA.id,
        supplierId: supplier.id,
        totalAmount: 700,
        paidAmount: 0,
        outstanding: 700,
        date: d5,
      },
    });

    // ── Run the engine ──
    console.log("\n── Insights ──");
    const insights = await getBusinessInsights(userA.id);

    // Top products
    check("top product is Rice", insights.topProducts[0]?.name === "Rice", insights.topProducts[0]?.name ?? "none");
    check("Rice revenue counts only the last 30 days (1500)", insights.topProducts[0]?.revenue === "1500", insights.topProducts[0]?.revenue ?? "none");
    check("Rice quantity is 10", insights.topProducts[0]?.quantity === "10", insights.topProducts[0]?.quantity ?? "none");
    check("Sugar is second", insights.topProducts[1]?.name === "Sugar", insights.topProducts[1]?.name ?? "none");
    check("old sale does not create an extra product row", insights.topProducts.length === 2, `${insights.topProducts.length}`);

    // Slow movers
    check("slow movers contains only unsold Tea", insights.slowMovers.length === 1 && insights.slowMovers[0]?.name === "Old Tea", JSON.stringify(insights.slowMovers));
    check("Tea stock value = 10 × 200 = 2000", insights.slowMovers[0]?.stockValue === "2000", insights.slowMovers[0]?.stockValue ?? "none");

    // Sales trend
    const expectedThisMonth = [d5, d10]
      .filter((d) => d.getTime() >= monthStart.getTime())
      .reduce((sum, d) => sum + (d.getTime() === d5.getTime() ? 1500 : 400), 0);
    const expectedLastMonth = d40.getTime() >= lastMonthStart.getTime() && d40.getTime() < monthStart.getTime() ? 3000 : 0;
    check(
      `this month = ${expectedThisMonth}`,
      Number(insights.salesTrend.thisMonth) === expectedThisMonth,
      insights.salesTrend.thisMonth,
    );
    check(
      `last month = ${expectedLastMonth}`,
      Number(insights.salesTrend.lastMonth) === expectedLastMonth,
      insights.salesTrend.lastMonth,
    );

    // Receivables: Ahmed 1500 + 400 + 3000 = 4900 (all sales), Quiet 3000 → 7900
    check("receivables total = 7900", insights.receivables.total === "7900", insights.receivables.total);
    check("receivables customer count = 2", insights.receivables.customersCount === 2, `${insights.receivables.customersCount}`);

    // Payables
    check("payables total = 1200", insights.payables.total === "1200", insights.payables.total);
    check("payables supplier count = 1", insights.payables.suppliersCount === 1, `${insights.payables.suppliersCount}`);

    // Inactive customers
    check(
      "quiet customer is flagged as inactive",
      insights.inactiveCustomers.some((c) => c.name === "Quiet Trader"),
      JSON.stringify(insights.inactiveCustomers),
    );
    check(
      "recent customer is NOT flagged as inactive",
      !insights.inactiveCustomers.some((c) => c.name === "Ahmed"),
    );

    // ── Empty business: no fabrication ──
    console.log("\n── Empty business ──");
    const empty = await getBusinessInsights(userB.id);
    check("empty business has no top products", empty.topProducts.length === 0);
    check("empty business has no slow movers", empty.slowMovers.length === 0);
    check("empty business receivables = 0", empty.receivables.total === "0", empty.receivables.total);
    check("empty business payables = 0", empty.payables.total === "0", empty.payables.total);
    check("empty business has no trend baseline", empty.salesTrend.changePct === null);
    check("empty business month sales = 0", empty.salesTrend.thisMonth === "0", empty.salesTrend.thisMonth);

    // Tenant isolation
    console.log("\n── Tenant isolation ──");
    check("B cannot see A's receivables", empty.receivables.customersCount === 0);
    check("B cannot see A's suppliers", empty.payables.suppliersCount === 0);
    check("B cannot see A's low stock", empty.lowStock.length === 0);
  } finally {
    console.log("\n── Cleanup ──");
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    console.log("  cleaned up test users");
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("Verification crashed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
