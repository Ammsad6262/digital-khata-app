/**
 * Seeds demo data for the NEW modules only (suppliers, purchases,
 * supplier payments, reminders) for an existing account.
 *
 * Non-destructive and idempotent: it never deletes anything, and it skips
 * each section if that account already has data.
 *
 * Run: npx tsx scripts/seed-new-features.ts [email]
 */

import { PrismaClient } from "@prisma/client";
import { createSupplier } from "@/lib/services/suppliers";
import { createPurchase } from "@/lib/services/purchases";
import { createSupplierPayment } from "@/lib/services/supplier-payments";
import { createReminder } from "@/lib/services/reminders";

const prisma = new PrismaClient();
const email = process.argv[2] ?? "sadatrehman2004@gmail.com";

function atHour(daysFromNow: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account with email ${email}`);
  const userId = user.id;
  console.log(`Seeding new-feature demo data for ${email}\n`);

  // ── Supplier ──────────────────────────────────────────────────────────────
  let supplier = await prisma.supplier.findFirst({
    where: { userId, isDeleted: false },
    orderBy: { createdAt: "asc" },
  });

  if (!supplier) {
    const created = await createSupplier(
      {
        name: "Karachi Rice Mills",
        phone: "0300 1234567",
        address: "Jodia Bazar, Karachi",
        notes: "Demo supplier seeded locally",
        openingBalance: 0,
      },
      userId,
    );
    supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id } });
    console.log(`✅ supplier created: ${created.name}`);
  } else {
    console.log(`• supplier already exists: ${supplier.name}`);
  }

  // ── Purchase ──────────────────────────────────────────────────────────────
  const purchaseCount = await prisma.purchase.count({ where: { userId } });
  if (purchaseCount === 0) {
    const product =
      (await prisma.product.findFirst({
        where: { userId, isDeleted: false, name: { contains: "Basmati" } },
      })) ??
      (await prisma.product.findFirstOrThrow({ where: { userId, isDeleted: false } }));

    const qty = 20;
    const cost = Number(product.purchasePrice);
    const paid = Math.round(qty * cost * 0.3);

    const p = await createPurchase(
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: qty, unitCost: cost }],
        paidAmount: paid,
        notes: "Demo purchase seeded locally",
      },
      userId,
    );
    console.log(
      `✅ purchase: ${qty} x ${product.name} — total ${p.totalAmount}, paid ${p.paidAmount}, on credit ${p.outstanding}`,
    );

    // ── Supplier payment (partial) ──────────────────────────────────────────
    const paymentCount = await prisma.supplierPayment.count({ where: { userId } });
    if (paymentCount === 0) {
      const sp = await createSupplierPayment(
        {
          supplierId: supplier.id,
          amount: 2000,
          method: "cash",
          notes: "Demo part-payment seeded locally",
        },
        userId,
      );
      console.log(`✅ supplier payment: ${sp.amount} to ${sp.supplierName ?? supplier.name}`);
    }
  } else {
    console.log(`• purchases already exist (${purchaseCount})`);
  }

  // ── Reminders ─────────────────────────────────────────────────────────────
  const reminderCount = await prisma.reminder.count({ where: { userId } });
  if (reminderCount === 0) {
    const customers = await prisma.customer.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    const lowProduct = await prisma.product.findFirst({
      where: { userId, isDeleted: false, name: { contains: "Sugar" } },
    });

    const picks = [
      {
        title: customers[0] ? `Collect payment from ${customers[0].name}` : "Collect payment from customer",
        type: "payment_collection" as const,
        dueAt: atHour(-1, 11),
        priority: "high" as const,
        customerId: customers[0]?.id ?? null,
      },
      {
        title: customers[1] ? `Call ${customers[1].name} about the new order` : "Call customer about order",
        type: "customer_followup" as const,
        dueAt: atHour(0, 18),
        priority: "normal" as const,
        customerId: customers[1]?.id ?? null,
      },
      {
        title: `Pay ${supplier.name}`,
        type: "supplier_payment" as const,
        dueAt: atHour(3, 10),
        priority: "normal" as const,
        supplierId: supplier.id,
      },
      {
        title: lowProduct ? `Reorder ${lowProduct.name} (low stock)` : "Reorder low-stock items",
        type: "stock_reorder" as const,
        dueAt: atHour(2, 9),
        priority: "low" as const,
        productId: lowProduct?.id ?? null,
      },
    ];

    for (const pick of picks) {
      const r = await createReminder(pick, userId);
      console.log(`✅ reminder (${r.priority}): ${r.title}`);
    }
  } else {
    console.log(`• reminders already exist (${reminderCount})`);
  }

  console.log("\nDone. No existing rows were deleted.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
