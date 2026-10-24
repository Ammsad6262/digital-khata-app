/**
 * Verifies the payment-recovery workflow against real records.
 *
 * What must be true:
 *   - Only real open sales create a recovery row; paid and voided sales do not.
 *   - Outstanding, overdue amount, invoice count and days overdue are exact.
 *   - Logging a contact or creating a reminder never changes the balance.
 *   - A payment reduces the balance and the list reflects it.
 *   - Filters separate overdue, due-soon and no-due-date customers.
 *   - One business never sees another business's debtors.
 *
 * Run: npx tsx scripts/verify-recovery.ts
 */

import { prisma } from "@/lib/db/prisma";
import { createCustomer } from "@/lib/services/customers";
import { createProduct } from "@/lib/services/products";
import { createSale } from "@/lib/services/sales";
import { recordPayment } from "@/lib/services/payments";
import {
  getRecoveryData,
  logRecoveryContact,
  createRecoveryReminder,
} from "@/lib/services/recovery";
import { buildRecoveryMessage } from "@/lib/utils/recovery";
import { tServer } from "@/lib/i18n/server";
import { dateStringInTz } from "@/lib/utils/date";

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

function dateString(daysFromToday: number): string {
  return dateStringInTz(new Date(Date.now() + daysFromToday * 86_400_000));
}

async function main() {
  const stamp = Date.now();
  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "Recovery Test A", email: `rca_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Recovery Test B", email: `rcb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const productA = await createProduct(
      {
        name: "Recovery Item",
        unit: "piece",
        purchasePrice: 10,
        sellingPrice: 100,
        openingStock: 500,
      },
      userA.id,
    );
    const productB = await createProduct(
      {
        name: "Foreign Recovery Item",
        unit: "piece",
        purchasePrice: 10,
        sellingPrice: 100,
        openingStock: 50,
      },
      userB.id,
    );

    const overdueCustomer = await createCustomer({ name: "Overdue Customer", phone: "03001110001" }, userA.id);
    const noDueCustomer = await createCustomer({ name: "No Due Customer" }, userA.id);
    const dueSoonCustomer = await createCustomer({ name: "Due Soon Customer" }, userA.id);
    const paidCustomer = await createCustomer({ name: "Paid Customer" }, userA.id);
    const foreignCustomer = await createCustomer({ name: "Foreign Debtor" }, userB.id);

    // A: 1000 overdue by 10 days + 500 due in 5 days = 1500 outstanding.
    await createSale(
      {
        customerId: overdueCustomer.id,
        items: [{ productId: productA.id, quantity: 10, unitPrice: 100 }],
        paidAmount: 0,
        dueDate: dateString(-10),
      },
      userA.id,
    );
    await createSale(
      {
        customerId: overdueCustomer.id,
        items: [{ productId: productA.id, quantity: 5, unitPrice: 100 }],
        paidAmount: 0,
        dueDate: dateString(5),
      },
      userA.id,
    );

    // B: 2000 with 500 paid, no due date = 1500 outstanding.
    await createSale(
      {
        customerId: noDueCustomer.id,
        items: [{ productId: productA.id, quantity: 20, unitPrice: 100 }],
        paidAmount: 500,
      },
      userA.id,
    );

    // D: 400 due in 3 days.
    await createSale(
      {
        customerId: dueSoonCustomer.id,
        items: [{ productId: productA.id, quantity: 4, unitPrice: 100 }],
        paidAmount: 0,
        dueDate: dateString(3),
      },
      userA.id,
    );

    // Paid in full: must never appear.
    await createSale(
      {
        customerId: paidCustomer.id,
        items: [{ productId: productA.id, quantity: 2, unitPrice: 100 }],
        paidAmount: 200,
      },
      userA.id,
    );

    // Other business: must never appear.
    await createSale(
      {
        customerId: foreignCustomer.id,
        items: [{ productId: productB.id, quantity: 9, unitPrice: 100 }],
        paidAmount: 0,
        dueDate: dateString(-30),
      },
      userB.id,
    );

    // ── List ──
    console.log("\n== Recovery list ==");
    const all = await getRecoveryData(userA.id, "all");
    check("three customers owe money", all.candidates.length === 3, all.candidates.length);
    check(
      "total outstanding = 3400",
      all.summary.totalOutstanding === "3400",
      all.summary.totalOutstanding,
    );
    check(
      "overdue outstanding = 1000",
      all.summary.overdueOutstanding === "1000",
      all.summary.overdueOutstanding,
    );
    check("one overdue customer", all.summary.overdueCustomersCount === 1, all.summary.overdueCustomersCount);
    check("oldest overdue = 10 days", all.summary.oldestOverdueDays === 10, all.summary.oldestOverdueDays);

    const overdue = all.candidates.find((c) => c.customerId === overdueCustomer.id);
    check("overdue customer outstanding = 1500", overdue?.outstanding === "1500", overdue?.outstanding);
    check("overdue customer has 2 open invoices", overdue?.openSales === 2, overdue?.openSales);
    check("overdue part = 1000", overdue?.overdueOutstanding === "1000", overdue?.overdueOutstanding);
    check("days overdue = 10", overdue?.daysOverdue === 10, overdue?.daysOverdue);
    check("overdue priority is high", overdue?.priority === "high", overdue?.priority);
    check(
      "overdue factors cite days and amount",
      overdue?.factors.some(
        (f) => f.code === "overdue" && f.params.days === 10 && f.params.amount === "1000",
      ) === true,
    );
    check(
      "overdue factors cite two invoices",
      overdue?.factors.some((f) => f.code === "invoices" && f.params.count === 2) === true,
    );

    const noDue = all.candidates.find((c) => c.customerId === noDueCustomer.id);
    check("no-due customer outstanding = 1500", noDue?.outstanding === "1500", noDue?.outstanding);
    check("no-due customer is not overdue", noDue?.daysOverdue === 0, noDue?.daysOverdue);
    check(
      "no-due factor is disclosed",
      noDue?.factors.some((f) => f.code === "noDueDate") === true,
    );
    check(
      "last payment is shown from the real sale payment",
      noDue?.lastPaymentAmount === "500",
      noDue?.lastPaymentAmount ?? "missing",
    );

    const paid = all.candidates.find((c) => c.customerId === paidCustomer.id);
    check("paid-in-full customer is absent", !paid);

    const foreign = all.candidates.find((c) => c.customerId === foreignCustomer.id);
    check("other business debtor is absent", !foreign);

    // ── Filters ──
    console.log("\n== Filters ==");
    const overdueOnly = await getRecoveryData(userA.id, "overdue");
    check("overdue filter returns one", overdueOnly.candidates.length === 1, overdueOnly.candidates.length);
    check(
      "overdue filter returns the right customer",
      overdueOnly.candidates[0]?.customerId === overdueCustomer.id,
    );

    const dueSoon = await getRecoveryData(userA.id, "due_soon");
    check("due-soon filter returns one", dueSoon.candidates.length === 1, dueSoon.candidates.length);
    check(
      "due-soon filter returns the right customer",
      dueSoon.candidates[0]?.customerId === dueSoonCustomer.id,
    );

    const noDate = await getRecoveryData(userA.id, "no_due_date");
    check("no-due-date filter returns one", noDate.candidates.length === 1, noDate.candidates.length);
    check(
      "no-due-date filter returns the right customer",
      noDate.candidates[0]?.customerId === noDueCustomer.id,
    );

    // ── Contact log does not change money ──
    console.log("\n== Contact log ==");
    const before = await getRecoveryData(userA.id, "all");
    const logged = await logRecoveryContact(userA.id, {
      customerId: overdueCustomer.id,
      method: "call",
      notes: "Asked for a date",
    });
    check("contact record has an id", Boolean(logged.id));
    const afterContact = await getRecoveryData(userA.id, "all");
    check(
      "logging contact did not change the balance",
      afterContact.summary.totalOutstanding === before.summary.totalOutstanding,
      `${before.summary.totalOutstanding} -> ${afterContact.summary.totalOutstanding}`,
    );
    const contactRow = afterContact.candidates.find((c) => c.customerId === overdueCustomer.id);
    check("last contact is recorded", Boolean(contactRow?.lastContactAt));
    const completedReminder = await prisma.reminder.findFirst({
      where: { userId: userA.id, customerId: overdueCustomer.id, completedAt: { not: null } },
    });
    check("contact is a completed reminder", Boolean(completedReminder));

    // ── Reminder does not change money ──
    console.log("\n== Recovery reminder ==");
    const reminder = await createRecoveryReminder(userA.id, {
      customerId: overdueCustomer.id,
      days: 1,
    });
    check("reminder has an id", Boolean(reminder.id));
    const openReminder = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    check("reminder is open", openReminder?.completedAt === null);
    check(
      "reminder title includes the real balance",
      openReminder?.title.includes("1500") === true,
      openReminder?.title,
    );
    const afterReminder = await getRecoveryData(userA.id, "all");
    check(
      "creating a reminder did not change the balance",
      afterReminder.summary.totalOutstanding === before.summary.totalOutstanding,
    );
    const reminderRow = afterReminder.candidates.find((c) => c.customerId === overdueCustomer.id);
    check("next reminder is shown", Boolean(reminderRow?.nextReminderAt));

    // ── A real payment changes the balance ──
    console.log("\n== Payment ==");
    await recordPayment(
      { customerId: overdueCustomer.id, amount: 400, method: "cash" },
      userA.id,
    );
    const afterPayment = await getRecoveryData(userA.id, "all");
    check(
      "total outstanding fell by 400",
      afterPayment.summary.totalOutstanding === "3000",
      afterPayment.summary.totalOutstanding,
    );
    const paidRow = afterPayment.candidates.find((c) => c.customerId === overdueCustomer.id);
    check("customer outstanding is 1100", paidRow?.outstanding === "1100", paidRow?.outstanding);

    // ── Message is built from real figures only ──
    console.log("\n== Message ==");
    const message = buildRecoveryMessage(paidRow!, en(), "Rs.", {
      businessName: "Test Wholesale",
    });
    check("message names the customer", message.includes("Overdue Customer"));
    check("message shows the real balance", message.includes("1,100"), message);
    check("message mentions the due date", message.includes("days past the due date"), message);
    check("message names the business", message.includes("Test Wholesale"));
    check("message invents no discount", !/discount|off\b|free\b/i.test(message));

    // ── Tenant guard ──
    console.log("\n== Tenant isolation ==");
    await expectFailure("cannot log contact for another business's customer", () =>
      logRecoveryContact(userA.id, { customerId: foreignCustomer.id, method: "call" }),
    );
    await expectFailure("cannot create a reminder for another business's customer", () =>
      createRecoveryReminder(userA.id, { customerId: foreignCustomer.id, days: 1 }),
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
