/**
 * Verifies the one-tap contact plumbing (Call / WhatsApp) and the reminder
 * enrichment that feeds it.
 * Run: npx tsx scripts/verify-contact-actions.ts
 */

import { prisma } from "@/lib/db/prisma";
import { createReminder, listReminders } from "@/lib/services/reminders";
import { getGrowthPlan } from "@/lib/services/growth";
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
  check("whatsapp link without a message is still valid", getContactWhatsAppLink("03001234567") === "https://wa.me/923001234567");

  console.log("\n── Reminder enrichment ──");
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: { name: "Contact Test", email: `contact_${stamp}@test.local`, passwordHash: "x" },
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
    check("reminder carries the customer phone", reminder?.customerPhone === "0300 1234567", reminder?.customerPhone);
    check("reminder carries the live balance", reminder?.customerBalance === "29050", reminder?.customerBalance);
    check(
      "a call link can be built from the reminder",
      !!getCallLink(reminder?.customerPhone),
    );

    console.log("\n── Growth contact actions ──");
    const plan = await getGrowthPlan(user.id);
    const collect = plan.recommendations.find((r) => r.id === `collect:${customer.id}`);
    check("collection recommendation exists", !!collect, "missing");
    check("collection names the contact", collect?.contactName === "Ahmed Khan", collect?.contactName);
    check("collection carries the phone", collect?.contactPhone === "0300 1234567", collect?.contactPhone);
    check(
      "a whatsapp link can be built with the exact amount",
      !!getContactWhatsAppLink(collect?.contactPhone, `Balance ${collect?.amount}`),
    );

    const stockItems = plan.recommendations.filter(
      (r) => r.type === "restock" || r.type === "clear_dead_stock" || r.type === "promote_product",
    );
    check(
      "stock actions have no contact buttons (nobody to call)",
      stockItems.every((r) => r.contactPhone === null),
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
    console.log("\n  cleaned up test business");
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
