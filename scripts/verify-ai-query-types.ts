/**
 * Verifies every QUERY type the voice assistant can answer, against real data.
 *
 * The assistant must read the owner's own records and nothing else. These
 * checks call the real query handler with a parsed interpretation — no AI
 * quota is spent, and every answer can be compared to the fixtures.
 *
 * Run: npx tsx scripts/verify-ai-query-types.ts
 */

import { prisma } from "@/lib/db/prisma";
import { processQuery } from "@/lib/smart-entry/service";
import type { AiInterpretation } from "@/lib/smart-entry/schema";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean | undefined, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

function ai(partial: Partial<AiInterpretation>): AiInterpretation {
  return {
    intent: "QUERY",
    customerName: null,
    productName: null,
    quantity: null,
    unit: null,
    batchName: null,
    explicitUnitPrice: null,
    explicitTotal: null,
    explicitPaidAmount: null,
    expenseName: null,
    needsClarification: false,
    ...partial,
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000 - 3_600_000);
}

type Row = {
  name?: string;
  balance?: string;
  stock?: number;
  amount?: string;
  days?: number;
  href?: string;
};

function rows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

async function main() {
  const stamp = Date.now();

  console.log("\n== Setup ==");
  const user = await prisma.user.create({
    data: { name: "Query Test", email: `q_${stamp}@test.local`, passwordHash: "x" },
  });
  const other = await prisma.user.create({
    data: { name: "Query Test Other", email: `qo_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const rice = await prisma.product.create({
      data: {
        userId: user.id,
        name: "Rice Query",
        unit: "kg",
        purchasePrice: 100,
        sellingPrice: 150,
        openingStock: 100,
        lowStockThreshold: 5,
        sku: `QR-${stamp}`,
      },
    });
    const sugar = await prisma.product.create({
      data: {
        userId: user.id,
        name: "Sugar Query",
        unit: "kg",
        purchasePrice: 100,
        sellingPrice: 140,
        openingStock: 2,
        lowStockThreshold: 10,
        sku: `QS-${stamp}`,
      },
    });
    const tea = await prisma.product.create({
      data: {
        userId: user.id,
        name: "Tea Query",
        unit: "pack",
        purchasePrice: 300,
        sellingPrice: 400,
        openingStock: 20,
        lowStockThreshold: 5,
        sku: `QT-${stamp}`,
      },
    });

    const ahmed = await prisma.customer.create({
      data: { userId: user.id, name: "Ahmed Query", phone: "03001110000", openingBalance: 5000 },
    });
    const quiet = await prisma.customer.create({
      data: { userId: user.id, name: "Quiet Query", phone: "03002220000" },
    });
    const regular = await prisma.customer.create({
      data: { userId: user.id, name: "Regular Query", phone: "03003330000" },
    });
    const settled = await prisma.customer.create({
      data: { userId: user.id, name: "Settled Query" },
    });
    const foreignCustomer = await prisma.customer.create({
      data: { userId: other.id, name: "Foreign Query", openingBalance: 99999 },
    });

    async function sale(customerId: string, productId: string, date: Date, total: number) {
      const s = await prisma.sale.create({
        data: {
          userId: user.id,
          customerId,
          totalAmount: total,
          paidAmount: 0,
          outstanding: total,
          date,
        },
      });
      await prisma.saleItem.create({
        data: { saleId: s.id, productId, quantity: 1, unitPrice: total, total },
      });
    }

    // Ahmed: one sale today (2000), one today payment (1000).
    await sale(ahmed.id, rice.id, new Date(), 2000);
    await prisma.payment.create({
      data: { userId: user.id, customerId: ahmed.id, amount: 1000, method: "cash", date: new Date() },
    });

    // Quiet: three different products on days 70/50/30 -> inactive.
    await sale(quiet.id, rice.id, daysAgo(70), 500);
    await sale(quiet.id, sugar.id, daysAgo(50), 500);
    await sale(quiet.id, tea.id, daysAgo(30), 500);

    // Regular: rice every 20 days, last 35 days ago -> reorder candidate.
    await sale(regular.id, rice.id, daysAgo(75), 500);
    await sale(regular.id, rice.id, daysAgo(55), 500);
    await sale(regular.id, rice.id, daysAgo(35), 500);
    void settled;

    const supplier = await prisma.supplier.create({
      data: { userId: user.id, name: "Ali Traders Query", phone: "03004440000" },
    });
    const purchase = await prisma.purchase.create({
      data: {
        userId: user.id,
        supplierId: supplier.id,
        totalAmount: 10000,
        paidAmount: 4000,
        outstanding: 6000,
        date: daysAgo(3),
      },
    });
    await prisma.purchaseItem.create({
      data: { purchaseId: purchase.id, productId: rice.id, quantity: 100, unitCost: 100, total: 10000 },
    });

    const reminder = await prisma.reminder.create({
      data: {
        userId: user.id,
        title: "Call the rice mill",
        type: "custom",
        dueAt: new Date(Date.now() - 60_000),
      },
    });
    void reminder;

    check("fixtures created", !!ahmed.id && !!supplier.id);

    // -- Customer balances -------------------------------------------------
    console.log("\n== Customer balances ==");
    const one = await processQuery(
      user.id,
      ai({ queryType: "CUSTOMER_BALANCES", queryEntity: "Ahmed" }),
      null,
    );
    check(
      "a named customer's balance is answered exactly",
      one.queryResult?.result.includes("Ahmed Query owes you Rs. 6,000"),
      one.queryResult?.result,
    );
    check(
      "the answer links straight to the customer",
      rows(one.queryResult?.data)[0]?.href === `/khata/${ahmed.id}`,
      JSON.stringify(rows(one.queryResult?.data)[0]),
    );

    const all = await processQuery(user.id, ai({ queryType: "CUSTOMER_BALANCES" }), null);
    const allRows = rows(all.queryResult?.data);
    check("only customers who owe are listed", allRows.length === 3, `${allRows.length}`);
    check("the settled customer is not listed", !allRows.some((r) => r.name === "Settled Query"));
    check(
      "another business's customer never appears",
      !allRows.some((r) => r.name === "Foreign Query"),
    );

    const unknown = await processQuery(
      user.id,
      ai({ queryType: "CUSTOMER_BALANCES", queryEntity: "Nobody" }),
      null,
    );
    check(
      "an unknown customer gets a plain answer",
      unknown.queryResult?.result.includes("No customer named"),
      unknown.queryResult?.result,
    );

    // -- Today's sales and cash received ----------------------------------
    console.log("\n== Sales and cash received ==");
    const today = await processQuery(
      user.id,
      ai({ queryType: "TODAYS_SALES", queryDateRange: "today" }),
      null,
    );
    check(
      "today's sales are reported for today only",
      today.queryResult?.result.startsWith("Today: sales of Rs. 2,000"),
      today.queryResult?.result,
    );
    check(
      "cash received includes sale-time and later payments",
      today.queryResult?.result.includes("Cash received: Rs. 1,000"),
      today.queryResult?.result,
    );

    const allTime = await processQuery(
      user.id,
      ai({ queryType: "SALES_SUMMARY", queryDateRange: "all" }),
      null,
    );
    check(
      "all-time sales include the older sales too",
      allTime.queryResult?.result.includes("In total") &&
        allTime.queryResult?.result.includes("Rs. 5,000"),
      allTime.queryResult?.result,
    );

    // -- Stock --------------------------------------------------------------
    console.log("\n== Stock ==");
    const stock = await processQuery(
      user.id,
      ai({ queryType: "STOCK_LEVEL", queryEntity: "Rice" }),
      null,
    );
    check(
      "stock is computed from opening stock, moves and sales",
      stock.queryResult?.result.includes("95"),
      stock.queryResult?.result,
    );

    const low = await processQuery(user.id, ai({ queryType: "LOW_STOCK" }), null);
    const lowRows = rows(low.queryResult?.data);
    check("low stock lists the product below its threshold", lowRows.some((r) => r.name === "Sugar Query"));
    check("low stock does not list healthy products", !lowRows.some((r) => r.name === "Rice Query"));
    check(
      "low-stock rows open the product",
      lowRows[0]?.href === `/more/products/${sugar.id}`,
      `${lowRows[0]?.href}`,
    );

    // -- Suppliers ----------------------------------------------------------
    console.log("\n== Suppliers ==");
    const payables = await processQuery(user.id, ai({ queryType: "SUPPLIER_PAYABLES" }), null);
    check(
      "supplier payables report the amount owed",
      payables.queryResult?.result.includes("Rs. 6,000"),
      payables.queryResult?.result,
    );
    const payablesData = payables.queryResult?.data as {
      suppliers?: Array<{ href?: string }>;
    } | null;
    check(
      "payable rows open the supplier",
      payablesData?.suppliers?.[0]?.href === `/more/suppliers/${supplier.id}`,
      JSON.stringify(payablesData?.suppliers?.[0]),
    );

    const purchases = await processQuery(
      user.id,
      ai({ queryType: "SUPPLIER_PURCHASES", queryEntity: "Ali" }),
      null,
    );
    check(
      "purchases from a named supplier are summarised",
      purchases.queryResult?.result.includes("Rs. 10,000") &&
        purchases.queryResult?.result.includes("Rs. 6,000 is still unpaid"),
      purchases.queryResult?.result,
    );
    check(
      "purchase rows open the supplier",
      rows(purchases.queryResult?.data)[0]?.href === `/more/suppliers/${supplier.id}`,
    );

    const unknownSupplier = await processQuery(
      user.id,
      ai({ queryType: "SUPPLIER_PURCHASES", queryEntity: "Nobody Traders" }),
      null,
    );
    check(
      "an unknown supplier gets a plain answer",
      unknownSupplier.queryResult?.result.includes("No supplier named"),
      unknownSupplier.queryResult?.result,
    );

    // -- Growth-style questions --------------------------------------------
    console.log("\n== Growth questions ==");
    const inactive = await processQuery(user.id, ai({ queryType: "INACTIVE_CUSTOMERS" }), null);
    const inactiveRows = rows(inactive.queryResult?.data);
    check(
      "customers who stopped buying are listed",
      inactiveRows.some((r) => r.name === "Quiet Query"),
      JSON.stringify(inactiveRows.map((r) => r.name)),
    );
    check(
      "inactive rows open the customer",
      inactiveRows[0]?.href === `/khata/${quiet.id}`,
      `${inactiveRows[0]?.href}`,
    );

    const reorder = await processQuery(user.id, ai({ queryType: "REORDER_CANDIDATES" }), null);
    const reorderRows = rows(reorder.queryResult?.data);
    check(
      "customers past their buying interval are listed",
      reorderRows.some((r) => r.name?.startsWith("Regular Query")),
      JSON.stringify(reorderRows.map((r) => r.name)),
    );
    check(
      "reorder rows open the follow-up page",
      reorderRows[0]?.href === "/more/follow-ups",
      `${reorderRows[0]?.href}`,
    );

    const reminders = await processQuery(user.id, ai({ queryType: "TODAYS_REMINDERS" }), null);
    check(
      "reminders due today are reported",
      reminders.queryResult?.result.includes("1 due today"),
      reminders.queryResult?.result,
    );

    // -- Cleanup ------------------------------------------------------------
    console.log("\n== Cleanup ==");
    await prisma.reminder.deleteMany({ where: { userId: user.id } });
    await prisma.purchaseItem.deleteMany({ where: { purchase: { userId: user.id } } });
    await prisma.purchase.deleteMany({ where: { userId: user.id } });
    await prisma.supplier.deleteMany({ where: { userId: user.id } });
    await prisma.saleItem.deleteMany({ where: { sale: { userId: user.id } } });
    await prisma.sale.deleteMany({ where: { userId: user.id } });
    await prisma.payment.deleteMany({ where: { userId: user.id } });
    await prisma.product.deleteMany({ where: { userId: user.id } });
    await prisma.customer.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
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
