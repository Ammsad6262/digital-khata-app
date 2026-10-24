/**
 * Verifies the reports service against a real DB.
 *
 * What must be true:
 *   - The window is inclusive of both dates and excludes everything outside.
 *   - Cash received counts each payment exactly once. A payment taken at sale
 *     time is already a Payment row, so it must not be added to sale.paidAmount
 *     a second time.
 *   - Purchases separate "billed" from "cash paid" (paid at purchase + later
 *     supplier payments), with no double count.
 *   - Cost of goods uses the linked batch cost first, then the product's
 *     purchase price, and the report says so when a line has no cost at all.
 *   - Receivables/payables/stock are point-in-time and scoped to the tenant.
 *   - Profit is labelled as an estimate by the limitations it returns.
 *
 * Run: npx tsx scripts/verify-reports.ts
 */

import { prisma } from "@/lib/db/prisma";
import {
  getReportForRange,
  resolveReportRange,
  rangeForPreset,
  currentMonthRange,
  type ReportData,
} from "@/lib/services/reports";
import { dateStringInTz, todayDateStringInTz } from "@/lib/utils/date";
import { computeStockValuation } from "@/lib/utils/stock-valuation";

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

function money(value: string): number {
  return Number(value);
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
  const now = new Date();
  const oldDate = new Date(Date.now() - 40 * 86_400_000);
  const oldDay = dateStringInTz(oldDate, TZ);

  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "Report Test A", email: `ra_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Report Test B", email: `rb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    // ── Range parsing ────────────────────────────────────────────────────
    console.log("\n== Range parsing ==");
    const defaults = resolveReportRange(null, null, TZ);
    check("missing dates default to today", defaults.from === today && defaults.to === today);

    await expectFailure("invalid date is rejected", async () =>
      resolveReportRange("2026-02-31", "2026-03-01", TZ),
    );
    await expectFailure("reversed range is rejected", async () =>
      resolveReportRange("2026-03-02", "2026-03-01", TZ),
    );
    await expectFailure("range over 366 days is rejected", async () =>
      resolveReportRange("2025-01-01", "2026-03-01", TZ),
    );

    const todayPreset = rangeForPreset("today", TZ);
    check("today preset is a single day", todayPreset?.from === today && todayPreset?.to === today);

    const last7 = rangeForPreset("last7", TZ);
    const expected7Start = new Date(Date.now() - 6 * 86_400_000);
    check(
      "last7 preset starts six days back",
      last7?.from === dateStringInTz(expected7Start, TZ),
      last7?.from,
    );

    const lastMonth = rangeForPreset("lastMonth", TZ);
    check(
      "lastMonth preset ends on the last day of the previous month",
      !!lastMonth && /-(28|29|30|31)$/.test(lastMonth.to),
      lastMonth?.to,
    );

    const monthRange = currentMonthRange(TZ);
    check(
      "current month starts on day 01",
      monthRange.from.endsWith("-01") && monthRange.from <= monthRange.to,
      monthRange.from,
    );

    // ── Stock valuation rule (pure) ──────────────────────────────────────
    console.log("\n== Stock valuation rule ==");
    const valued = computeStockValuation([
      { currentStock: 10, purchasePrice: 120 },
      { currentStock: 2, purchasePrice: 0 },
      { currentStock: -5, purchasePrice: 100 },
      { currentStock: 0, purchasePrice: 50 },
    ]);
    check("positive stock is valued at purchase price", money(valued.value) === 1200, valued.value);
    check("stock with no price is counted as unvalued", valued.unvaluedProducts === 1);
    check("negative and zero stock are ignored", valued.productsWithStock === 2);

    const fractional = computeStockValuation([{ currentStock: "1.5", purchasePrice: "10.25" }]);
    check("valuation keeps exact decimals (15.38)", fractional.value === "15.38", fractional.value);

    // ── Fixtures ─────────────────────────────────────────────────────────
    console.log("\n== Fixtures ==");
    const rice = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Basmati Rice",
        sku: `RICE-${stamp}`,
        unit: "bag",
        purchasePrice: 120,
        sellingPrice: 150,
      },
    });
    // Deliberately has no purchase price, so its sold cost is unknown.
    const sugar = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Sugar",
        sku: `SUGAR-${stamp}`,
        unit: "kg",
        purchasePrice: 0,
        sellingPrice: 160,
      },
    });
    // In stock but no purchase price: stock value must say it is not valued.
    const salt = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Salt",
        sku: `SALT-${stamp}`,
        unit: "kg",
        purchasePrice: 0,
        sellingPrice: 60,
        openingStock: 5,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        userId: userA.id,
        name: "Ahmed Buyer",
        phone: "03001234567",
        openingBalance: 5000,
      },
    });
    const supplier = await prisma.supplier.create({
      data: {
        userId: userA.id,
        name: "Karachi Wholesale",
        openingBalance: 2000,
      },
    });

    // A purchase batch for rice at 100/bag. The linked sale must use 100,
    // while an unlinked rice sale falls back to the product price of 120.
    const batch = await prisma.stockMove.create({
      data: {
        userId: userA.id,
        productId: rice.id,
        type: "purchase",
        quantity: 20,
        remainingQuantity: 10,
        unitCost: 100,
        batchName: "October batch",
        date: now,
      },
    });

    async function saleWithItems(
      date: Date,
      paid: number,
      items: Array<{ productId: string; quantity: number; unitPrice: number; stockMoveId?: string }>,
    ) {
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const sale = await prisma.sale.create({
        data: {
          userId: userA.id,
          customerId: customer.id,
          totalAmount: total,
          paidAmount: paid,
          outstanding: total - paid,
          date,
        },
      });
      for (const item of items) {
        await prisma.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            ...(item.stockMoveId && { stockMoveId: item.stockMoveId }),
          },
        });
      }
      if (paid > 0) {
        // This is what createSale() does, and it is why cash received must be
        // counted from Payment rows only.
        await prisma.payment.create({
          data: {
            userId: userA.id,
            customerId: customer.id,
            saleId: sale.id,
            amount: paid,
            method: "cash",
            date,
          },
        });
      }
      return sale;
    }

    // In range: 1,820 billed, 500 paid at the counter.
    const sale1 = await saleWithItems(now, 500, [
      { productId: rice.id, quantity: 10, unitPrice: 150, stockMoveId: batch.id },
      { productId: sugar.id, quantity: 2, unitPrice: 160 },
    ]);
    // In range: 600 on credit, then 300 paid the same day.
    const sale2 = await saleWithItems(now, 0, [
      { productId: rice.id, quantity: 4, unitPrice: 150 },
    ]);
    await prisma.payment.create({
      data: {
        userId: userA.id,
        customerId: customer.id,
        saleId: sale2.id,
        amount: 300,
        method: "cash",
        date: now,
      },
    });
    // Out of range: must not appear anywhere in today's report.
    const oldSale = await saleWithItems(oldDate, 0, [
      { productId: rice.id, quantity: 3, unitPrice: 150 },
    ]);
    await prisma.payment.create({
      data: {
        userId: userA.id,
        customerId: customer.id,
        saleId: oldSale.id,
        amount: 700,
        method: "cash",
        date: oldDate,
      },
    });

    await prisma.expense.create({
      data: {
        userId: userA.id,
        name: "Delivery fuel",
        amount: 300,
        category: "transport",
        date: now,
      },
    });
    await prisma.expense.create({
      data: {
        userId: userA.id,
        name: "Old shop rent",
        amount: 700,
        category: "rent",
        date: oldDate,
      },
    });

    const purchase = await prisma.purchase.create({
      data: {
        userId: userA.id,
        supplierId: supplier.id,
        totalAmount: 5000,
        paidAmount: 2000,
        outstanding: 3000,
        date: now,
      },
    });
    await prisma.supplierPayment.create({
      data: {
        userId: userA.id,
        supplierId: supplier.id,
        purchaseId: purchase.id,
        amount: 1000,
        method: "cash",
        date: now,
      },
    });
    // Fully paid, out of range.
    await prisma.purchase.create({
      data: {
        userId: userA.id,
        supplierId: supplier.id,
        totalAmount: 4000,
        paidAmount: 4000,
        outstanding: 0,
        date: oldDate,
      },
    });

    // Another tenant with records that must never leak.
    const foreignProduct = await prisma.product.create({
      data: {
        userId: userB.id,
        name: "Foreign Item",
        sku: `FOREIGN-${stamp}`,
        unit: "piece",
        purchasePrice: 50,
        sellingPrice: 80,
      },
    });
    const foreignCustomer = await prisma.customer.create({
      data: { userId: userB.id, name: "Foreign Buyer", openingBalance: 999 },
    });
    const foreignSale = await prisma.sale.create({
      data: {
        userId: userB.id,
        customerId: foreignCustomer.id,
        totalAmount: 777,
        paidAmount: 0,
        outstanding: 777,
        date: now,
      },
    });
    await prisma.saleItem.create({
      data: {
        saleId: foreignSale.id,
        productId: foreignProduct.id,
        quantity: 1,
        unitPrice: 777,
        total: 777,
      },
    });

    // ── Today's report ───────────────────────────────────────────────────
    console.log("\n== Today's report ==");
    const report = await getReportForRange(userA.id, today, today, TZ);

    check("window echoes the requested dates", report.from === today && report.to === today);
    check("sales billed = 2,420", money(report.sales.billed) === 2420, report.sales.billed);
    check("only today's two sales are counted", report.sales.count === 2, String(report.sales.count));
    check(
      "cash received counts each payment once (800, not 1,300)",
      money(report.sales.cashReceived) === 800,
      report.sales.cashReceived,
    );

    check("purchases billed = 5,000", money(report.purchases.billed) === 5000, report.purchases.billed);
    check(
      "cash paid to suppliers = 3,000 (2,000 + 1,000)",
      money(report.purchases.cashPaid) === 3000,
      report.purchases.cashPaid,
    );
    check("only today's purchase is counted", report.purchases.count === 1, String(report.purchases.count));

    check("expenses = 300", money(report.expenses.total) === 300, report.expenses.total);
    check("expense count = 1", report.expenses.count === 1, String(report.expenses.count));
    check(
      "expense category is transport / 300",
      report.expenses.byCategory.length === 1 &&
        report.expenses.byCategory[0]?.category === "transport" &&
        money(report.expenses.byCategory[0]?.amount ?? "0") === 300,
    );

    check("cogs uses batch cost then product price = 1,480", money(report.profit.cogs) === 1480, report.profit.cogs);
    check("gross profit = 940", money(report.profit.grossProfit) === 940, report.profit.grossProfit);
    check("net estimate = 640", money(report.profit.netProfit) === 640, report.profit.netProfit);
    check("margin = 26.45%", report.profit.profitMargin === "26.45", report.profit.profitMargin);

    // Receivables: opening 5,000 + all sales 1,820 + 600 + 450 − all payments 500 + 300 + 700.
    check("receivables are as of now (6,370)", money(report.position.receivables) === 6370, report.position.receivables);
    check("one customer owes money", report.position.receivablesCount === 1, String(report.position.receivablesCount));
    // Payables: opening 2,000 + outstanding 3,000 + 0 − supplier payment 1,000.
    check("payables are as of now (4,000)", money(report.position.payables) === 4000, report.position.payables);
    check("one supplier is owed", report.position.payablesCount === 1, String(report.position.payablesCount));
    // Stock: rice opening 0 + purchased 20 − sold 17 = 3 bags × 120. Sugar is
    // −2 (ignored); salt is 5 × 0 (unvalued, counted separately).
    check("stock value = 360", money(report.position.stockValue) === 360, report.position.stockValue);
    check("one product in stock is not valued", report.position.stockNotValued === 1, String(report.position.stockNotValued));

    check("top product is rice", report.topProducts[0]?.name === "Basmati Rice", report.topProducts[0]?.name);
    check(
      "top product quantity = 14 and revenue = 2,100",
      report.topProducts[0]?.quantity === "14" && money(report.topProducts[0]?.revenue ?? "0") === 2100,
      `${report.topProducts[0]?.quantity} / ${report.topProducts[0]?.revenue}`,
    );
    check(
      "sugar appears second with 2 sold",
      report.topProducts[1]?.name === "Sugar" && report.topProducts[1]?.quantity === "2",
    );
    check(
      "customer-wise sales show billed value and count",
      report.sales.byCustomer.length === 1 &&
        report.sales.byCustomer[0]?.name === "Ahmed Buyer" &&
        money(report.sales.byCustomer[0]?.billed ?? "0") === 2420 &&
        report.sales.byCustomer[0]?.count === 2,
      JSON.stringify(report.sales.byCustomer),
    );
    check(
      "supplier-wise purchases separate paid-at-purchase from later payments",
      report.purchases.bySupplier.length === 1 &&
        report.purchases.bySupplier[0]?.name === "Karachi Wholesale" &&
        money(report.purchases.bySupplier[0]?.billed ?? "0") === 5000 &&
        money(report.purchases.bySupplier[0]?.paidAtPurchase ?? "0") === 2000 &&
        money(report.purchases.bySupplier[0]?.supplierPayments ?? "0") === 1000,
      JSON.stringify(report.purchases.bySupplier),
    );

    check(
      "payments are grouped by method (cash 800 / 2)",
      report.collections.byMethod.length === 1 &&
        report.collections.byMethod[0]?.method === "cash" &&
        money(report.collections.byMethod[0]?.amount ?? "0") === 800 &&
        report.collections.byMethod[0]?.count === 2,
      JSON.stringify(report.collections.byMethod),
    );
    check(
      "customer balance list shows who owes you",
      report.balances.customers.length === 1 &&
        report.balances.customers[0]?.name === "Ahmed Buyer" &&
        money(report.balances.customers[0]?.balance ?? "0") === 6370,
      JSON.stringify(report.balances.customers),
    );
    check(
      "supplier balance list shows who you owe",
      report.balances.suppliers.length === 1 &&
        report.balances.suppliers[0]?.name === "Karachi Wholesale" &&
        money(report.balances.suppliers[0]?.balance ?? "0") === 4000,
      JSON.stringify(report.balances.suppliers),
    );
    check(
      "low-stock list uses the product threshold",
      report.lowStock.some((product) => product.name === "Basmati Rice") &&
        report.lowStock.some((product) => product.name === "Sugar"),
      JSON.stringify(report.lowStock.map((p) => p.name)),
    );
    const yesterday = dateStringInTz(new Date(Date.now() - 86_400_000), TZ);
    check(
      "comparison window is the day before",
      report.comparison.from === yesterday && report.comparison.to === yesterday,
      `${report.comparison.from}..${report.comparison.to}`,
    );
    check(
      "comparison has no percentage when the previous day was empty",
      report.comparison.changes.salesPct === null &&
        money(report.comparison.salesBilled) === 0,
      String(report.comparison.changes.salesPct),
    );

    const limitationKeys = report.limitations.map((l) => l.key);
    check("report always states the cost basis", limitationKeys.includes("reports.limit.cogs"));
    check("report always states that expenses are only recorded ones", limitationKeys.includes("reports.limit.recordedExpenses"));
    check("report always states the point-in-time caveat", limitationKeys.includes("reports.limit.position"));
    check("report always separates invoiced sales from cash", limitationKeys.includes("reports.limit.invoiced"));
    check(
      "missing cost is reported with the line count",
      report.limitations.some((l) => l.key === "reports.limit.missingCost" && l.params?.count === 1),
    );
    check("no-expense warning is absent when an expense exists", !limitationKeys.includes("reports.limit.noExpenses"));
    check(
      "stock valuation gap is reported",
      report.limitations.some(
        (l) => l.key === "reports.limit.stockValuation" && l.params?.count === 1,
      ),
    );

    // ── Old window ───────────────────────────────────────────────────────
    console.log("\n== Old window ==");
    const oldReport = await getReportForRange(userA.id, oldDay, oldDay, TZ);
    check("old window sees the old sale only", money(oldReport.sales.billed) === 450 && oldReport.sales.count === 1, oldReport.sales.billed);
    check("old window sees the old cash only", money(oldReport.sales.cashReceived) === 700, oldReport.sales.cashReceived);
    check("old window sees the old expense only", money(oldReport.expenses.total) === 700, oldReport.expenses.total);
    check("old window sees the old purchase only", money(oldReport.purchases.billed) === 4000 && oldReport.purchases.count === 1);
    check("old window has no top product from today", oldReport.topProducts.every((p) => p.name !== "Sugar"));

    // ── Tenant isolation ─────────────────────────────────────────────────
    console.log("\n== Tenant isolation ==");
    const foreignReport: ReportData = await getReportForRange(userB.id, today, today, TZ);
    check("another tenant's sales are invisible", money(foreignReport.sales.billed) === 777, foreignReport.sales.billed);
    check("another tenant's expenses are invisible", money(foreignReport.expenses.total) === 0);
    check("another tenant's purchases are invisible", money(foreignReport.purchases.billed) === 0);
    check(
      "another tenant's top product is their own",
      foreignReport.topProducts.length === 1 && foreignReport.topProducts[0]?.name === "Foreign Item",
    );
    check("another tenant's receivables are their own", money(foreignReport.position.receivables) === 1776, foreignReport.position.receivables);

    // ── Cleanup ──────────────────────────────────────────────────────────
    console.log("\n== Cleanup ==");
    await prisma.expense.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.supplierPayment.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.purchase.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.payment.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.saleItem.deleteMany({ where: { sale: { userId: { in: [userA.id, userB.id] } } } });
    await prisma.sale.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.stockMove.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.product.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.customer.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.supplier.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
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
