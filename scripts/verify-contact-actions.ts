/**
 * Verifies the one-tap contact plumbing (Call / WhatsApp), reminder snoozing
 * and the supplier-reorder contact that growth recommendations carry.
 *
 * Run: npx tsx scripts/verify-contact-actions.ts
 */

import { prisma } from "@/lib/db/prisma";
import {
  createReminder,
  getReminder,
  listReminders,
  setReminderCompleted,
  snoozeReminder,
} from "@/lib/services/reminders";
import { getGrowthPlan } from "@/lib/services/growth";
import { createProduct } from "@/lib/services/products";
import { createSupplier } from "@/lib/services/suppliers";
import { createPurchase } from "@/lib/services/purchases";
import {
  getCallLink,
  getContactWhatsAppLink,
  toInternationalNumber,
} from "@/lib/utils/whatsapp";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string | null) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const DAY_MS = 86_400_000;

/** Whole days between now and a date (rounded), for readable assertions. */
function daysFromNow(date: Date | string): number {
  return Math.round((new Date(date).getTime() - Date.now()) / DAY_MS);
}

async function main() {
  console.log("\n── Phone normalisation ──");
  check("local 0300… → 92300…", toInternationalNumber("0300 1234567") === "923001234567");
  check("+92 300… → 92300…", toInternationalNumber("+92 300 1234567") === "923001234567");
  check("already international is kept", toInternationalNumber("923001234567") === "923001234567");
  check("bare 10-digit → 92…", toInternationalNumber("3001234567") === "923001234567");
  check("dashes are ignored", toInternationalNumber("0300-1234567") === "923001234567");
  check("too short → null", toInternationalNumber("12345") === null);
  check("empty → null", toInternationalNumber("") === null && toInternationalNumber(null) === null);

  console.log("\n── Links ──");
  check("call link keeps local form", getCallLink("0300 1234567") === "tel:03001234567");
  check("call link rejects junk", getCallLink("abc") === null);
  const wa = getContactWhatsAppLink("0300 1234567", "Assalam-o-Alaikum Ahmed");
  check(
    "whatsapp link has the right number",
    !!wa && wa.startsWith("https://wa.me/923001234567?text="),
    wa,
  );
  check("whatsapp link encodes the message", !!wa && wa.includes("Assalam-o-Alaikum%20Ahmed"), wa);
  check(
    "whatsapp link without a message is still valid",
    getContactWhatsAppLink("03001234567") === "https://wa.me/923001234567",
  );

  console.log("\n── Setup ──");
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: { name: "Contact Test", email: `contact_${stamp}@test.local`, passwordHash: "x" },
  });
  const other = await prisma.user.create({
    data: { name: "Other Tenant", email: `contact_other_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const customer = await prisma.customer.create({
      data: {
        userId: user.id,
        name: "Ahmed Khan",
        phone: "0300 1234567",
        openingBalance: 29050,
      },
    });

    console.log("\n── Reminder enrichment ──");
    await createReminder(
      {
        title: "Call Ahmed Khan about the new order",
        type: "customer_followup",
        dueAt: new Date(),
        priority: "high",
        customerId: customer.id,
      },
      user.id,
    );

    const reminders = await listReminders("all", user.id);
    const reminder = reminders[0];
    check(
      "reminder carries the customer phone",
      reminder?.customerPhone === "0300 1234567",
      reminder?.customerPhone,
    );
    check("reminder carries the live balance", reminder?.customerBalance === "29050", reminder?.customerBalance);
    check("a call link can be built from the reminder", !!getCallLink(reminder?.customerPhone));

    console.log("\n── Snooze ──");
    // A customer with exactly one reminder, so the follow-up date is
    // unambiguously the snoozed reminder's new date.
    const followCustomer = await prisma.customer.create({
      data: { userId: user.id, name: "Follow-up Only", phone: "0300 0000000", openingBalance: 100 },
    });
    const overdue = await createReminder(
      {
        title: "Overdue collection",
        type: "payment_collection",
        dueAt: new Date(Date.now() - DAY_MS),
        priority: "high",
        customerId: followCustomer.id,
      },
      user.id,
    );

    const snoozed = await snoozeReminder(overdue.id, 3, user.id);
    check("an overdue reminder moves 3 days from now", daysFromNow(snoozed.dueAt) === 3, String(daysFromNow(snoozed.dueAt)));

    const linkedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: followCustomer.id } });
    check(
      "the customer's follow-up date follows the snoozed reminder",
      linkedCustomer.nextFollowUpAt?.getTime() === new Date(snoozed.dueAt).getTime(),
      String(linkedCustomer.nextFollowUpAt),
    );

    const future = await createReminder(
      { title: "Future reminder", type: "custom", dueAt: new Date(Date.now() + 5 * DAY_MS) },
      user.id,
    );
    const futureSnoozed = await snoozeReminder(future.id, 7, user.id);
    check(
      "a future reminder moves 7 days from its own date",
      daysFromNow(futureSnoozed.dueAt) === 12,
      String(daysFromNow(futureSnoozed.dueAt)),
    );

    await setReminderCompleted(overdue.id, true, user.id);
    const reopened = await snoozeReminder(overdue.id, 1, user.id);
    check("snoozing reopens a completed reminder", reopened.completedAt === null);
    check("only 1–365 days is accepted", await rejects(() => snoozeReminder(overdue.id, 0, user.id)));

    check("another tenant cannot snooze it", await rejects(() => snoozeReminder(overdue.id, 2, other.id)));
    check("an unknown reminder cannot be snoozed", await rejects(() => snoozeReminder("does_not_exist", 2, user.id)));
    check("the reminder still exists after snoozing", !!(await getReminder(future.id, user.id)));

    console.log("\n── Growth contact actions ──");
    let plan = await getGrowthPlan(user.id);
    const collect = plan.recommendations.find((r) => r.id === `collect:${customer.id}`);
    check("collection recommendation exists", !!collect, "missing");
    check("collection names the contact", collect?.contactName === "Ahmed Khan", collect?.contactName);
    check("collection carries the phone", collect?.contactPhone === "0300 1234567", collect?.contactPhone);
    check("collection is marked as a customer contact", collect?.contactKind === "customer");
    check(
      "a whatsapp link can be built with the exact amount",
      !!getContactWhatsAppLink(collect?.contactPhone, `Balance ${collect?.amount}`),
    );

    console.log("\n── Supplier reorder ──");
    const supplier = await createSupplier({ name: "Karachi Rice Mills", phone: "0300 7654321" }, user.id);
    const rice = await createProduct(
      {
        name: "Basmati Rice 25kg",
        unit: "bag",
        purchasePrice: 5000,
        sellingPrice: 6000,
        openingStock: 20,
        lowStockThreshold: 25,
      },
      user.id,
    );
    const other2 = await createProduct(
      {
        name: "Never Purchased Item",
        unit: "piece",
        purchasePrice: 10,
        sellingPrice: 20,
        openingStock: 20,
        lowStockThreshold: 25,
      },
      user.id,
    );

    // Both products are low on stock and selling — only one has a supplier.
    await prisma.sale.create({
      data: {
        userId: user.id,
        customerId: customer.id,
        totalAmount: 18000,
        paidAmount: 0,
        outstanding: 18000,
        date: new Date(Date.now() - 5 * DAY_MS),
        items: {
          create: [
            { productId: rice.id, quantity: 3, unitPrice: 6000, total: 18000 },
            { productId: other2.id, quantity: 2, unitPrice: 20, total: 40 },
          ],
        },
      },
    });

    await createPurchase(
      {
        supplierId: supplier.id,
        items: [{ productId: rice.id, quantity: 1, unitCost: 5000, batchName: "Sep batch" }],
        paidAmount: 0,
      },
      user.id,
    );

    plan = await getGrowthPlan(user.id);
    const restock = plan.recommendations.find((r) => r.id === `restock:${rice.id}`);
    const orphan = plan.recommendations.find((r) => r.id === `restock:${other2.id}`);

    check("restock recommendation exists", !!restock, "missing");
    check(
      "restock offers the supplier who actually supplied it",
      restock?.contactName === "Karachi Rice Mills" && restock?.contactPhone === "0300 7654321",
      `${restock?.contactName} / ${restock?.contactPhone}`,
    );
    check("restock is marked as a supplier contact", restock?.contactKind === "supplier");
    check(
      "suggested order tops up to your own threshold",
      restock?.reorder?.quantity === "7" && restock?.reorder?.unit === "bag",
      `${restock?.reorder?.quantity} ${restock?.reorder?.unit}`,
    );
    check(
      "restock links straight to the add-stock form",
      !!restock?.href.startsWith("/stock/add?productId="),
      restock?.href,
    );
    check(
      "a product never bought has no contact buttons",
      orphan?.contactPhone === null && orphan?.contactKind === null,
      `${orphan?.contactPhone} / ${orphan?.contactKind}`,
    );
    check(
      "the reorder message can be built from the plan",
      !!getContactWhatsAppLink(restock?.contactPhone, `Need ${restock?.reorder?.quantity} ${restock?.reorder?.unit}`),
    );

    const stockItems = plan.recommendations.filter(
      (r) => r.type === "clear_dead_stock" || r.type === "promote_product",
    );
    check(
      "shelf actions have no contact buttons (nobody to call)",
      stockItems.every((r) => r.contactPhone === null && r.contactKind === null),
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    console.log("\n  cleaned up test business");
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}

async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

main()
  .catch((e) => {
    console.error("Verification crashed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
