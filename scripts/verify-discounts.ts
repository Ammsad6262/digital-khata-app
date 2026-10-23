/**
 * Verifies whole-sale discounts.
 *
 * What must be true:
 *   - The customer is billed the item total minus the discount, exactly.
 *   - A discount can never be negative or larger than the goods.
 *   - Money taken at sale time can never exceed the discounted total.
 *   - Revenue (P&L and reports) is the discounted total, never the item total.
 *   - The receipt shows the discount explicitly, so the line maths still adds up.
 *   - One business never sees another business's discounts.
 *
 * Run: npx tsx scripts/verify-discounts.ts
 */

import { prisma } from "@/lib/db/prisma";
import { createSale, voidSale, listSales } from "@/lib/services/sales";
import { getCustomerBalance } from "@/lib/services/customers";
import { getProfitLossRange } from "@/lib/services/profit-loss";
import { getReportForRange } from "@/lib/services/reports";
import { buildSaleReceipt } from "@/lib/utils/receipt";
import { tServer } from "@/lib/i18n/server";
import { startOfDayInTz, todayDateStringInTz } from "@/lib/utils/date";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string | number) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` - ${detail}` : ""}`);
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

function en() {
  return {
    t: (key: Parameters<typeof tServer>[0]) => tServer(key),
    tParams: (key: Parameters<typeof tServer>[0], params: Record<string, string | number>) =>
      tServer(key, params),
  };
}

const TZ = "Asia/Karachi";

async function main() {
  const stamp = Date.now();
  const today = todayDateStringInTz(TZ);
  const from = startOfDayInTz(today, TZ);
  if (!from) throw new Error("could not resolve today");

  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "Discount Test A", email: `dca_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Discount Test B", email: `dcb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const productA = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Discount Item",
        sku: `DISC-${stamp}`,
        unit: "piece",
        purchasePrice: 100,
        sellingPrice: 150,
        openingStock: 100,
      },
    });
    const customerA = await prisma.customer.create({
      data: { userId: userA.id, name: "Discount Customer" },
    });
    const productB = await prisma.product.create({
      data: {
        userId: userB.id,
        name: "Foreign Discount Item",
        sku: `FOREIGN-DISC-${stamp}`,
        unit: "piece",
        purchasePrice: 10,
        sellingPrice: 150,
      },
    });
    const customerB = await prisma.customer.create({
      data: { userId: userB.id, name: "Foreign Discount Customer" },
    });

    async function makeSale(input: {
      userId: string;
      customerId: string;
      productId: string;
      quantity: number;
      unitPrice: number;
      paid: number;
      discount: number;
    }) {
      return createSale(
        {
          customerId: input.customerId,
          items: [
            {
              productId: input.productId,
              quantity: input.quantity,
              unitPrice: input.unitPrice,
            },
          ],
          paidAmount: input.paid,
          discountAmount: input.discount,
        },
        input.userId,
      );
    }

    // 1. 2 x 150 = 300, discount 50, paid 100 -> billed 250, owed 150.
    const s1 = await makeSale({
      userId: userA.id,
      customerId: customerA.id,
      productId: productA.id,
      quantity: 2,
      unitPrice: 150,
      paid: 100,
      discount: 50,
    });
    // 2. No discount -> billed 150.
    const s2 = await makeSale({
      userId: userA.id,
      customerId: customerA.id,
      productId: productA.id,
      quantity: 1,
      unitPrice: 150,
      paid: 0,
      discount: 0,
    });
    // 3. Full discount -> billed 0.
    const s3 = await makeSale({
      userId: userA.id,
      customerId: customerA.id,
      productId: productA.id,
      quantity: 1,
      unitPrice: 150,
      paid: 0,
      discount: 150,
    });
    // 4. Discounted and paid in full -> billed 110.
    const s5 = await makeSale({
      userId: userA.id,
      customerId: customerA.id,
      productId: productA.id,
      quantity: 1,
      unitPrice: 150,
      paid: 110,
      discount: 40,
    });
    // 5. Voided later -> must vanish from every figure.
    const s4 = await makeSale({
      userId: userA.id,
      customerId: customerA.id,
      productId: productA.id,
      quantity: 1,
      unitPrice: 150,
      paid: 0,
      discount: 50,
    });
    await voidSale(s4.id, userA.id);

    // 6. Another tenant's discount must never leak.
    const foreign = await makeSale({
      userId: userB.id,
      customerId: customerB.id,
      productId: productB.id,
      quantity: 1,
      unitPrice: 150,
      paid: 0,
      discount: 100,
    });

    // ── The sale itself ──────────────────────────────────────────────────
    console.log("\n== Billed amount ==");
    check("discounted total is items minus discount", Number(s1.totalAmount) === 250, s1.totalAmount);
    check("discount is stored on the sale", Number(s1.discountAmount) === 50, s1.discountAmount);
    check("outstanding is the discounted total minus paid", Number(s1.outstanding) === 150, s1.outstanding);
    check("paid + outstanding equals the billed total", Number(s1.paidAmount) + Number(s1.outstanding) === Number(s1.totalAmount));
    check("a zero discount leaves the total alone", Number(s2.totalAmount) === 150, s2.totalAmount);
    check("a full discount bills zero", Number(s3.totalAmount) === 0, s3.totalAmount);
    check("a fully discounted sale owes nothing", Number(s3.outstanding) === 0, s3.outstanding);
    check("discounted paid-in-full sale is settled", Number(s5.outstanding) === 0, s5.outstanding);

    const payment = await prisma.payment.findFirst({
      where: { saleId: s1.id, userId: userA.id },
    });
    check("the payment row holds only the money taken", Number(payment?.amount ?? -1) === 100, payment?.amount?.toString());

    // ── Refusals ─────────────────────────────────────────────────────────
    console.log("\n== Refusals ==");
    const before = await prisma.sale.count({ where: { userId: userA.id } });
    await expectFailure("a negative discount is rejected", async () =>
      makeSale({
        userId: userA.id,
        customerId: customerA.id,
        productId: productA.id,
        quantity: 1,
        unitPrice: 150,
        paid: 0,
        discount: -1,
      }),
    );
    await expectFailure("a discount larger than the goods is rejected", async () =>
      makeSale({
        userId: userA.id,
        customerId: customerA.id,
        productId: productA.id,
        quantity: 1,
        unitPrice: 150,
        paid: 0,
        discount: 151,
      }),
    );
    await expectFailure("paying more than the discounted total is rejected", async () =>
      makeSale({
        userId: userA.id,
        customerId: customerA.id,
        productId: productA.id,
        quantity: 1,
        unitPrice: 150,
        paid: 101,
        discount: 50,
      }),
    );
    const after = await prisma.sale.count({ where: { userId: userA.id } });
    check("a rejected sale writes nothing", before === after, `${before} -> ${after}`);

    // ── Receipt ──────────────────────────────────────────────────────────
    console.log("\n== Receipt ==");
    const receipt = buildSaleReceipt(s1, en(), "Rs.");
    check("receipt shows the amount before discount", receipt.includes("Before discount: Rs. 300"));
    check("receipt shows the discount", receipt.includes("Discount: Rs. 50"));
    check("receipt shows the billed total", receipt.includes("Total: Rs. 250"));
    check("receipt still shows what is owed", receipt.includes("Still to pay: Rs. 150"));
    const plainReceipt = buildSaleReceipt(s2, en(), "Rs.");
    check("receipt omits discount lines when there is none", !plainReceipt.includes("Discount:"));
    check("plain receipt total is unchanged", plainReceipt.includes("Total: Rs. 150"));

    // ── Revenue ──────────────────────────────────────────────────────────
    console.log("\n== Profit and loss ==");
    const pl = await getProfitLossRange(userA.id, from, new Date(from.getTime() + 86_400_000));
    check("revenue is the discounted total", Number(pl.revenue) === 510, pl.revenue);
    check("a fully discounted sale adds no revenue", Number(pl.revenue) === 250 + 150 + 110, pl.revenue);
    check("voided sale revenue is excluded", Number(pl.revenue) !== 560, pl.revenue);

    // ── Reports ──────────────────────────────────────────────────────────
    console.log("\n== Reports ==");
    const report = await getReportForRange(userA.id, today, today, TZ);
    check("report sales billed is discounted", Number(report.sales.billed) === 510, report.sales.billed);
    check("report shows discounts given", Number(report.sales.discounts) === 240, report.sales.discounts);
    check("report cash received is unchanged by discount", Number(report.sales.cashReceived) === 210, report.sales.cashReceived);
    check(
      "report explains top-product values are before discount",
      report.limitations.some((l) => l.key === "reports.limit.discounts"),
    );
    const topRevenue = report.topProducts.reduce((sum, p) => sum + Number(p.revenue), 0);
    check("top products keep the line value before discount", topRevenue === 750, topRevenue);

    const foreignReport = await getReportForRange(userB.id, today, today, TZ);
    check("another business's discount is not counted", Number(foreignReport.sales.discounts) === 100, foreignReport.sales.discounts);
    check("another business's billed amount is its own", Number(foreignReport.sales.billed) === 50, foreignReport.sales.billed);

    // ── Khata balance ────────────────────────────────────────────────────
    console.log("\n== Khata ==");
    const balance = await getCustomerBalance(customerA.id);
    check("customer owes the discounted outstanding only", Number(balance.balance) === 300, balance.balance);
    check("foreign customer owes its own discounted amount", Number((await getCustomerBalance(customerB.id)).balance) === 50);

    // ── List view ────────────────────────────────────────────────────────
    console.log("\n== Sales list ==");
    const list = await listSales(50, userA.id);
    const listed = new Map(list.map((s) => [s.id, s]));
    check("sales list carries the discount", Number(listed.get(s1.id)?.discountAmount) === 50);
    check("sales list keeps the discounted total", Number(listed.get(s1.id)?.totalAmount) === 250);
    check("voided sale is absent from the list", !listed.has(s4.id));
    check("foreign sale is absent from the list", !listed.has(foreign.id));

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
