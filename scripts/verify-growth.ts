/**
 * Verifies the Growth Assistant recommendation engine.
 * Run: npx tsx scripts/verify-growth.ts
 *
 * All assertions are computed from real rows created for a throw-away
 * business, then deleted.
 */

import { prisma } from "@/lib/db/prisma";
import { createSale } from "@/lib/services/sales";
import { getGrowthPlan, growthFactsForNarration } from "@/lib/services/growth";
import { numbersAreSupported } from "@/lib/services/growth-narration";

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

async function main() {
  const stamp = Date.now();
  const userA = await prisma.user.create({
    data: { name: "Growth A", email: `ga_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Growth B", email: `gb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    console.log("\n── Setup ──");
    const bigDebtor = await prisma.customer.create({
      data: { userId: userA.id, name: "Big Debtor", openingBalance: 60000 },
    });
    const quietPayer = await prisma.customer.create({
      data: { userId: userA.id, name: "Quiet Payer", openingBalance: 4000 },
    });
    await prisma.customer.create({
      data: { userId: userA.id, name: "Small Debtor", openingBalance: 5000 },
    });
    await prisma.customer.create({
      data: { userId: userA.id, name: "Mid One", openingBalance: 8000 },
    });
    await prisma.customer.create({
      data: { userId: userA.id, name: "Mid Two", openingBalance: 7000 },
    });

    const fastMover = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Fast Mover",
        unit: "kg",
        purchasePrice: 100,
        sellingPrice: 150,
        openingStock: 3,
        lowStockThreshold: 10,
      },
    });
    const deadStock = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Dead Stock Item",
        unit: "piece",
        purchasePrice: 50,
        sellingPrice: 80,
        openingStock: 100,
        lowStockThreshold: 5,
      },
    });
    await prisma.supplier.create({
      data: { userId: userA.id, name: "Test Supplier", openingBalance: 10000 },
    });

    await createSale(
      {
        customerId: bigDebtor.id,
        items: [{ productId: fastMover.id, quantity: 20, unitPrice: 150 }],
        paidAmount: 0,
        date: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      },
      userA.id,
    );
    console.log("  data created");

    console.log("\n── Plan ──");
    const plan = await getGrowthPlan(userA.id);
    const byType = (type: string) => plan.recommendations.filter((r) => r.type === type);
    const findById = (id: string) => plan.recommendations.find((r) => r.id === id);

    check("plan has recommendations", plan.recommendations.length > 0, `${plan.recommendations.length}`);

    const collect = findById(`collect:${bigDebtor.id}`);
    check("collect recommendation for the biggest debtor", !!collect, "missing");
    check("collect amount is 63000 (60000 opening + 3000 sale)", collect?.amount === "63000", collect?.amount);
    check("collect is high priority", collect?.priority === "high", collect?.priority);

    const restock = findById(`restock:${fastMover.id}`);
    check("restock recommendation for the fast mover", !!restock, "missing");
    check("restock is high priority (20 sold)", restock?.priority === "high", restock?.priority);
    check(
      "restock reason cites sold qty and remaining stock",
      !!restock?.reason.includes("20") && !!restock?.reason.includes("left"),
      restock?.reason,
    );

    const dead = findById(`dead:${deadStock.id}`);
    check("dead stock recommendation", !!dead, "missing");
    check("dead stock value is 5000 (100 × 50)", dead?.amount === "5000", dead?.amount);

    check("re-engage recommendation for quiet payer", byType("reengage_customer").some((r) => r.title.includes("Quiet Payer")));
    check("promote recommendation exists", byType("promote_product").length >= 1);
    check("supplier payment recommendation", byType("supplier_payment").length === 1);

    check("totals.receivables is 87000", plan.totals.receivables === "87000", plan.totals.receivables);
    check("totals.payables is 10000", plan.totals.payables === "10000", plan.totals.payables);
    check("totals.deadStockValue is 5000", plan.totals.deadStockValue === "5000", plan.totals.deadStockValue);

    check("high priority sorts first", plan.recommendations[0]?.priority === "high", plan.recommendations[0]?.priority);

    const amounts = plan.recommendations.map((r) => r.amount).filter((a): a is string => a !== null);
    check(
      "every amount is a finite number",
      amounts.every((a) => Number.isFinite(Number(a)) && Number(a) >= 0),
      amounts.join(","),
    );

    check(
      "no recommendation claims profit",
      plan.recommendations.every((r) => !/profit|earning|income/i.test(`${r.title} ${r.reason}`)),
    );

    console.log("\n── Empty business ──");
    const emptyPlan = await getGrowthPlan(userB.id);
    check("no recommendations for empty business", emptyPlan.recommendations.length === 0, `${emptyPlan.recommendations.length}`);
    check("empty summary explains why", emptyPlan.summary.includes("No actions yet"), emptyPlan.summary);
    check("empty totals are zero", emptyPlan.totals.receivables === "0" && emptyPlan.totals.payables === "0");

    console.log("\n── Tenant isolation ──");
    check(
      "plan B never mentions A's customers",
      !emptyPlan.recommendations.some((r) => r.title.includes("Big Debtor")),
    );

    console.log("\n── Narration guard ──");
    const facts = growthFactsForNarration(plan);
    const expectedShare = Math.round((63000 / 87000) * 100);
    check("accepts numbers present in the facts", numbersAreSupported("You should collect 63000 from your top customer.", facts));
    check(
      "accepts a percentage present in the facts",
      numbersAreSupported(`That is ${expectedShare}% of receivables.`, facts),
    );
    check("rejects an invented amount", !numbersAreSupported("You could earn 999999 this month.", facts));
    check("rejects an invented percentage", !numbersAreSupported("Sales grew 47% this week.", facts));
  } finally {
    console.log("\n── Cleanup ──");
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    console.log("  cleaned up test businesses");
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
