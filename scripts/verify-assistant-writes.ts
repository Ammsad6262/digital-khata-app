/**
 * Verifies assistant WRITE actions (supplier payment + reminder) end-to-end.
 * Run: npx tsx scripts/verify-assistant-writes.ts
 *
 * Creates throw-away businesses and sessions, executes through the real
 * service functions, and cleans up. No AI call needed.
 */

import { prisma } from "@/lib/db/prisma";
import {
  executeSupplierPaymentSession,
  executeReminderSession,
  executePurchaseSession,
} from "@/lib/smart-entry/service";
import { listSuppliersWithBalance } from "@/lib/services/suppliers";

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

async function expectFailure(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "expected an error but it succeeded");
  } catch {
    check(label, true);
  }
}

async function makeSession(userId: string, intent: string): Promise<string> {
  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "test",
      intent,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  return session.id;
}

async function main() {
  const stamp = Date.now();
  console.log("\n── Setup ──");
  const userA = await prisma.user.create({
    data: { name: "Write A", email: `wa_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Write B", email: `wb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const supplier = await prisma.supplier.create({
      data: { userId: userA.id, name: "Rice Mill", openingBalance: 5000 },
    });
    const customer = await prisma.customer.create({
      data: { userId: userA.id, name: "Ahmed", openingBalance: 0 },
    });

    console.log("\n── Supplier payment ──");
    const paymentSession = await makeSession(userA.id, "SUPPLIER_PAYMENT");
    const result = await executeSupplierPaymentSession(userA.id, {
      sessionId: paymentSession,
      supplierId: supplier.id,
      amount: 2000,
      method: "cash",
    });
    check("result type is supplier_payment", result.resultType === "supplier_payment", result.resultType);

    const payment = await prisma.supplierPayment.findFirst({
      where: { supplierId: supplier.id, userId: userA.id },
    });
    check("payment row created", !!payment, "missing");
    check("payment amount is 2000", payment?.amount.toString() === "2000", String(payment?.amount));

    const balances = await listSuppliersWithBalance(userA.id);
    const payable = balances.find((s) => s.id === supplier.id)?.balance;
    check("payable reduced from 5000 to 3000", payable === "3000", String(payable));

    const sessionAfter = await prisma.smartEntrySession.findUnique({ where: { id: paymentSession } });
    check("session marked COMPLETED", sessionAfter?.status === "COMPLETED", sessionAfter?.status ?? "none");

    console.log("\n── Duplicate protection ──");
    await expectFailure("same session cannot execute twice", () =>
      executeSupplierPaymentSession(userA.id, {
        sessionId: paymentSession,
        supplierId: supplier.id,
        amount: 2000,
      }),
    );
    const paymentCount = await prisma.supplierPayment.count({
      where: { supplierId: supplier.id, userId: userA.id },
    });
    check("still exactly one payment row", paymentCount === 1, `${paymentCount}`);

    console.log("\n── Tenant isolation ──");
    const foreignSession = await makeSession(userA.id, "SUPPLIER_PAYMENT");
    await expectFailure("business B cannot execute A's session", () =>
      executeSupplierPaymentSession(userB.id, {
        sessionId: foreignSession,
        supplierId: supplier.id,
        amount: 100,
      }),
    );
    const foreignPayments = await prisma.supplierPayment.count({
      where: { supplierId: supplier.id, userId: userB.id },
    });
    check("B created no payment", foreignPayments === 0, `${foreignPayments}`);

    console.log("\n── Reminder ──");
    const reminderSession = await makeSession(userA.id, "CREATE_REMINDER");
    const dueAt = new Date(Date.now() + 86_400_000);
    const reminderResult = await executeReminderSession(userA.id, {
      sessionId: reminderSession,
      title: "Call Ahmed",
      dueAt: dueAt.toISOString(),
      priority: "high",
      type: "customer_followup",
      customerId: customer.id,
    });
    check("result type is reminder", reminderResult.resultType === "reminder", reminderResult.resultType);

    const reminder = await prisma.reminder.findFirst({
      where: { userId: userA.id, title: "Call Ahmed" },
    });
    check("reminder row created", !!reminder, "missing");
    check("reminder priority is high", reminder?.priority === "high", reminder?.priority ?? "none");
    check("reminder linked to customer", reminder?.customerId === customer.id, reminder?.customerId ?? "none");

    const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check(
      "customer.nextFollowUpAt synced to the due date",
      customerAfter.nextFollowUpAt?.getTime() === dueAt.getTime(),
      String(customerAfter.nextFollowUpAt),
    );

    await expectFailure("reminder session cannot execute twice", () =>
      executeReminderSession(userA.id, {
        sessionId: reminderSession,
        title: "Call Ahmed",
        dueAt: dueAt.toISOString(),
      }),
    );
    const reminderCount = await prisma.reminder.count({
      where: { userId: userA.id, title: "Call Ahmed" },
    });
    check("still exactly one reminder", reminderCount === 1, `${reminderCount}`);

    const foreignReminderSession = await makeSession(userA.id, "CREATE_REMINDER");
    await expectFailure("business B cannot execute A's reminder session", () =>
      executeReminderSession(userB.id, {
        sessionId: foreignReminderSession,
        title: "hacked",
        dueAt: dueAt.toISOString(),
      }),
    );
    const bReminders = await prisma.reminder.count({ where: { userId: userB.id } });
    check("B created no reminder", bReminders === 0, `${bReminders}`);

    console.log("\n── Purchase from a supplier ──");
    const product = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Sugar",
        unit: "kg",
        purchasePrice: 100,
        sellingPrice: 150,
        openingStock: 5,
      },
    });

    const purchaseSession = await makeSession(userA.id, "CREATE_PURCHASE");
    const purchaseResult = await executePurchaseSession(userA.id, {
      sessionId: purchaseSession,
      supplierId: supplier.id,
      productId: product.id,
      quantity: 10,
      unitCost: 100,
      paidAmount: 400,
    });
    check("result type is purchase", purchaseResult.resultType === "purchase", purchaseResult.resultType);

    const purchase = await prisma.purchase.findFirst({
      where: { supplierId: supplier.id, userId: userA.id },
      include: { items: true },
    });
    check("purchase row created", !!purchase, "missing");
    check("purchase total is 1000", purchase?.totalAmount.toString() === "1000", String(purchase?.totalAmount));
    check("purchase paid is 400", purchase?.paidAmount.toString() === "400", String(purchase?.paidAmount));
    check("purchase outstanding is 600", purchase?.outstanding.toString() === "600", String(purchase?.outstanding));
    check("one purchase line item", purchase?.items.length === 1, String(purchase?.items.length));

    const moves = await prisma.stockMove.findMany({ where: { productId: product.id } });
    const inbound = moves.reduce((sum, m) => sum + Number(m.quantity), 0);
    check("stock increased by 10", inbound === 10, String(inbound));

    const balancesAfterPurchase = await listSuppliersWithBalance(userA.id);
    const payableAfter = balancesAfterPurchase.find((s) => s.id === supplier.id)?.balance;
    check("payable now 3600 (3000 + 600)", payableAfter === "3600", String(payableAfter));

    await expectFailure("purchase session cannot execute twice", () =>
      executePurchaseSession(userA.id, {
        sessionId: purchaseSession,
        supplierId: supplier.id,
        productId: product.id,
        quantity: 10,
        unitCost: 100,
        paidAmount: 400,
      }),
    );
    const purchaseCount = await prisma.purchase.count({
      where: { supplierId: supplier.id, userId: userA.id },
    });
    check("still exactly one purchase", purchaseCount === 1, `${purchaseCount}`);

    const overpaySession = await makeSession(userA.id, "CREATE_PURCHASE");
    await expectFailure("paid amount above total is rejected", () =>
      executePurchaseSession(userA.id, {
        sessionId: overpaySession,
        supplierId: supplier.id,
        productId: product.id,
        quantity: 1,
        unitCost: 100,
        paidAmount: 5000,
      }),
    );
    const overpay = await prisma.smartEntrySession.findUniqueOrThrow({ where: { id: overpaySession } });
    check("failed session marked FAILED", overpay.status === "FAILED", overpay.status);
    const stockAfterFailure = await prisma.stockMove.count({ where: { productId: product.id } });
    check("no extra stock move on failure", stockAfterFailure === 1, `${stockAfterFailure}`);

    const foreignPurchaseSession = await makeSession(userA.id, "CREATE_PURCHASE");
    await expectFailure("business B cannot execute A's purchase session", () =>
      executePurchaseSession(userB.id, {
        sessionId: foreignPurchaseSession,
        supplierId: supplier.id,
        productId: product.id,
        quantity: 1,
        unitCost: 100,
      }),
    );
    const bPurchases = await prisma.purchase.count({ where: { userId: userB.id } });
    check("B created no purchase", bPurchases === 0, `${bPurchases}`);
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
