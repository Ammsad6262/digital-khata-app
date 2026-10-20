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
