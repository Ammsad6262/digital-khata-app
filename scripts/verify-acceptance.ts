/**
 * End-to-end acceptance workflows (1–10).
 * Run: npx tsx scripts/verify-acceptance.ts
 *
 * Each workflow uses the real service functions, in the same order a shop
 * owner would use the app: register → customer → sale → payment → expense →
 * stock → supplier/purchase → supplier payment → reminder → insights/growth.
 *
 * The throw-away business is deleted at the end.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { registerUser, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { createCustomer } from "@/lib/services/customers";
import { createProduct, listProductsWithStock } from "@/lib/services/products";
import { createSale } from "@/lib/services/sales";
import { recordPayment } from "@/lib/services/payments";
import { recordExpense } from "@/lib/services/expenses";
import { addStockMove } from "@/lib/services/stock";
import { createSupplier, listSuppliersWithBalance } from "@/lib/services/suppliers";
import { createPurchase } from "@/lib/services/purchases";
import { createSupplierPayment } from "@/lib/services/supplier-payments";
import { createReminder, setReminderCompleted, getReminderCounts } from "@/lib/services/reminders";
import { getBusinessInsights } from "@/lib/services/insights";
import { getGrowthPlan } from "@/lib/services/growth";
import { GET as growthGET } from "@/app/api/growth/route";
import { BILLING_ENABLED } from "@/lib/services/subscription";

let passed = 0;
let failed = 0;
let workflow = "";

function check(label: string, condition: boolean, detail?: string | null) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function start(n: number, title: string) {
  workflow = `${n}. ${title}`;
  console.log(`\n── Workflow ${workflow} ──`);
}

async function stockOf(userId: string, productId: string): Promise<string> {
  const products = await listProductsWithStock(userId);
  return products.find((p) => p.id === productId)?.currentStock ?? "missing";
}

async function balanceOf(userId: string, customerId: string): Promise<string> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId },
    select: { openingBalance: true },
  });
  if (!customer) return "missing";

  const [sales, payments] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { customerId, voidedAt: null },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { customerId, voidedAt: null },
    }),
  ]);

  const balance =
    Number(customer.openingBalance) +
    Number(sales._sum.totalAmount ?? 0) -
    Number(payments._sum.amount ?? 0);

  return balance.toString();
}

async function payableOf(userId: string, supplierId: string): Promise<string> {
  const suppliers = await listSuppliersWithBalance(userId);
  return suppliers.find((s) => s.id === supplierId)?.balance ?? "missing";
}

async function main() {
  const stamp = Date.now();
  const account = await registerUser({
    name: "Acceptance Owner",
    email: `accept_${stamp}@test.local`,
    password: "secret123",
  });
  const userId = account.user.id;
  const expired = await registerUser({
    name: "Acceptance Expired",
    email: `accept_exp_${stamp}@test.local`,
    password: "secret123",
  });
  await prisma.userSubscription.update({
    where: { userId: expired.user.id },
    data: { trialExpiresAt: new Date(Date.now() - 86_400_000) },
  });

  try {
    start(1, "Register and start a trial");
    check("account created", !!userId);
    check("auth token issued", !!account.token);
    const sub = await prisma.userSubscription.findUnique({ where: { userId } });
    check("trial is active", !!sub && sub.trialExpiresAt.getTime() > Date.now());

    start(2, "Add a customer");
    const customer = await createCustomer(
      { name: "Acceptance Customer", phone: "0300 9998887", openingBalance: 0 },
      userId,
    );
    check("customer created", !!customer.id);
    check("starts at zero balance", (await balanceOf(userId, customer.id)) === "0");

    start(3, "Sell on credit");
    const product = await createProduct(
      {
        name: "Acceptance Rice",
        unit: "kg",
        purchasePrice: 300,
        sellingPrice: 500,
        openingStock: 0,
        lowStockThreshold: 20,
      },
      userId,
    );
    await addStockMove(
      { productId: product.id, type: "purchase", quantity: 100, unitCost: 300, batchName: "Opening batch" },
      userId,
    );
    const sale = await createSale(
      {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 10, unitPrice: 500 }],
        paidAmount: 1000,
        date: new Date().toISOString(),
      },
      userId,
    );
    check("sale total is 5000", sale.totalAmount.toString() === "5000", String(sale.totalAmount));
    check("outstanding is 4000", sale.outstanding.toString() === "4000", String(sale.outstanding));
    check("stock dropped to 90", (await stockOf(userId, product.id)) === "90", await stockOf(userId, product.id));
    check("customer owes 4000", (await balanceOf(userId, customer.id)) === "4000");

    start(4, "Record a payment");
    await recordPayment({ customerId: customer.id, amount: 1500, method: "cash" }, userId);
    check("customer now owes 2500", (await balanceOf(userId, customer.id)) === "2500");

    start(5, "Record an expense");
    await recordExpense({ name: "Shop tea", amount: 200, category: "shop" }, userId);
    const expenseCount = await prisma.expense.count({ where: { userId, name: "Shop tea" } });
    check("expense saved", expenseCount === 1, `${expenseCount}`);

    start(6, "Add stock");
    await addStockMove(
      { productId: product.id, type: "purchase", quantity: 50, unitCost: 300, batchName: "Second batch" },
      userId,
    );
    check("stock is now 140", (await stockOf(userId, product.id)) === "140", await stockOf(userId, product.id));

    start(7, "Buy from a supplier on credit");
    const supplier = await createSupplier(
      { name: "Acceptance Supplier", phone: "0301 1112223", openingBalance: 0 },
      userId,
    );
    const purchase = await createPurchase(
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 20, unitCost: 300 }],
        paidAmount: 1000,
      },
      userId,
    );
    check("purchase total is 6000", purchase.totalAmount.toString() === "6000", String(purchase.totalAmount));
    check("purchase outstanding is 5000", purchase.outstanding.toString() === "5000", String(purchase.outstanding));
    check("stock is now 160", (await stockOf(userId, product.id)) === "160", await stockOf(userId, product.id));
    check("supplier payable is 5000", (await payableOf(userId, supplier.id)) === "5000");

    start(8, "Pay the supplier");
    await createSupplierPayment({ supplierId: supplier.id, amount: 2000, method: "cash" }, userId);
    check("payable dropped to 3000", (await payableOf(userId, supplier.id)) === "3000", await payableOf(userId, supplier.id));

    let overpayRejected = false;
    try {
      await createSupplierPayment({ supplierId: supplier.id, amount: 999999, method: "cash" }, userId);
    } catch {
      overpayRejected = true;
    }
    check("overpayment is rejected", overpayRejected);
    check("payable unchanged after rejection", (await payableOf(userId, supplier.id)) === "3000");

    start(9, "Create and complete a reminder");
    const reminder = await createReminder(
      {
        title: "Collect from Acceptance Customer",
        type: "payment_collection",
        dueAt: new Date(),
        priority: "high",
        customerId: customer.id,
      },
      userId,
    );
    check("reminder created", !!reminder.id);
    const countsBefore = await getReminderCounts(userId);
    check("reminder counted for today", countsBefore.today >= 1, `${countsBefore.today}`);
    const customerBefore = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check("customer follow-up date set", !!customerBefore.nextFollowUpAt);

    await setReminderCompleted(reminder.id, true, userId);
    const countsAfter = await getReminderCounts(userId);
    check("open reminder count drops to zero", countsAfter.today === 0, `${countsAfter.today}`);
    const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check("customer follow-up date cleared", customerAfter.nextFollowUpAt === null);

    start(10, "Insights, growth plan and AI gating");
    const insights = await getBusinessInsights(userId);
    check("receivables match the ledger (2500)", insights.receivables.total === "2500", insights.receivables.total);
    check("payables match the ledger (3000)", insights.payables.total === "3000", insights.payables.total);

    const plan = await getGrowthPlan(userId);
    const collect = plan.recommendations.find((r) => r.id === `collect:${customer.id}`);
    const pay = plan.recommendations.find((r) => r.id === `pay:${supplier.id}`);
    check("growth plan finds the collection", !!collect, "missing");
    check("collection amount is 2500", collect?.amount === "2500", collect?.amount);
    check("growth plan finds the supplier payment", !!pay, "missing");
    check("supplier action amount is 3000", pay?.amount === "3000", pay?.amount);

    const expiredReq = new NextRequest("http://localhost/api/growth", {
      method: "GET",
      headers: { cookie: `${AUTH_COOKIE_NAME}=${expired.token}` },
    });
    const expiredRes = await growthGET(expiredReq);
    const expectedStatus = BILLING_ENABLED ? 403 : 200;
    check(
      BILLING_ENABLED
        ? "expired account blocked from growth API (403)"
        : "expired account still allowed while billing is off (200)",
      expiredRes.status === expectedStatus,
      `${expiredRes.status}`,
    );
  } finally {
    console.log("\n── Cleanup ──");
    await prisma.user.deleteMany({
      where: { id: { in: [userId, expired.user.id] } },
    });
    console.log("  cleaned up acceptance businesses");
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`ACCEPTANCE: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(`Acceptance crashed in workflow ${workflow}:`, e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
