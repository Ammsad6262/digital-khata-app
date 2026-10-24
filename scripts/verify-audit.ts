/**
 * Verifies the audit trail and the "clear all data" path.
 *
 * What must be true:
 *   - Important financial, stock, people and settings actions leave a row.
 *   - Audit rows are scoped to the business that performed the action.
 *   - Clearing business data removes suppliers, purchases, reminders and
 *     follow-ups too (not just the original tables), keeps settings, and
 *     leaves a "data.clear" record.
 *
 * Run: npx tsx scripts/verify-audit.ts
 */

import { prisma } from "@/lib/db/prisma";
import { createCustomer } from "@/lib/services/customers";
import { createProduct } from "@/lib/services/products";
import { createSale } from "@/lib/services/sales";
import { recordPayment } from "@/lib/services/payments";
import { recordExpense } from "@/lib/services/expenses";
import { createSupplier } from "@/lib/services/suppliers";
import { createPurchase } from "@/lib/services/purchases";
import { createSupplierPayment } from "@/lib/services/supplier-payments";
import { createReminder } from "@/lib/services/reminders";
import { createFollowUp, updateFollowUp } from "@/lib/services/follow-ups";
import { updateSettings, clearAllData } from "@/lib/services/settings";
import { listAuditLogs } from "@/lib/services/audit";

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

async function main() {
  const stamp = Date.now();
  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "Audit Test A", email: `audit_a_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Audit Test B", email: `audit_b_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const customer = await createCustomer(
      { name: "Audit Customer", phone: "03009990001" },
      userA.id,
    );
    const product = await createProduct(
      {
        name: "Audit Item",
        unit: "piece",
        purchasePrice: 60,
        sellingPrice: 100,
        openingStock: 100,
      },
      userA.id,
    );
    const sale = await createSale(
      {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 5, unitPrice: 100 }],
        paidAmount: 200,
      },
      userA.id,
    );
    await recordPayment(
      { customerId: customer.id, amount: 100, method: "cash" },
      userA.id,
    );
    await recordExpense(
      { name: "Audit Rent", amount: 500, category: "rent" },
      userA.id,
    );
    const supplier = await createSupplier(
      { name: "Audit Supplier", phone: "03009990002" },
      userA.id,
    );
    await createPurchase(
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitCost: 50 }],
        paidAmount: 100,
      },
      userA.id,
    );
    await createSupplierPayment(
      { supplierId: supplier.id, amount: 50, method: "cash" },
      userA.id,
    );
    const reminder = await createReminder(
      {
        title: "Audit reminder",
        type: "payment_collection",
        dueAt: new Date().toISOString(),
        customerId: customer.id,
      },
      userA.id,
    );
    const followUp = await createFollowUp(
      {
        customerId: customer.id,
        kind: "inactive",
        reason: "Test reason",
        message: "Test message",
      },
      userA.id,
    );
    await updateFollowUp(
      followUp.followUp.id,
      { outcome: "contacted" },
      userA.id,
    );
    await updateSettings(userA.id, { businessName: "Audit Wholesale" });

    // ── Audit rows ──
    console.log("\n== Audit rows ==");
    const logs = await listAuditLogs(userA.id);
    const actions = new Set(logs.map((row) => row.action));
    for (const action of [
      "customer.create",
      "product.create",
      "sale.create",
      "payment.create",
      "expense.create",
      "supplier.create",
      "purchase.create",
      "supplierPayment.create",
      "settings.update",
      "followUp.update",
    ]) {
      check(`recorded ${action}`, actions.has(action));
    }

    const saleLog = logs.find((row) => row.action === "sale.create");
    const saleMeta =
      saleLog?.metadata &&
      typeof saleLog.metadata === "object" &&
      !Array.isArray(saleLog.metadata)
        ? (saleLog.metadata as Record<string, unknown>)
        : null;
    check("sale log stores the real total", saleMeta?.total === "500", String(saleMeta?.total));
    check(
      "sale log names the customer",
      saleLog?.summary?.includes("Audit Customer") === true,
      saleLog?.summary ?? "missing summary",
    );
    check(
      "audit rows are newest first",
      logs.length > 1 &&
        new Date(logs[0]!.createdAt).getTime() >=
          new Date(logs[logs.length - 1]!.createdAt).getTime(),
    );

    // ── Tenant isolation ──
    console.log("\n== Tenant isolation ==");
    const otherLogs = await listAuditLogs(userB.id);
    check("other business sees no audit rows", otherLogs.length === 0, otherLogs.length);

    // ── Clear all data ──
    console.log("\n== Clear all data ==");
    const before = await prisma.auditLog.count({ where: { userId: userA.id } });
    const cleared = await clearAllData(userA.id);
    check("cleared suppliers", cleared.deleted.suppliers >= 1, cleared.deleted.suppliers);
    check("cleared purchases", cleared.deleted.purchases >= 1, cleared.deleted.purchases);
    check(
      "cleared purchase items",
      cleared.deleted.purchaseItems >= 1,
      cleared.deleted.purchaseItems,
    );
    check(
      "cleared supplier payments",
      cleared.deleted.supplierPayments >= 1,
      cleared.deleted.supplierPayments,
    );
    check("cleared reminders", cleared.deleted.reminders >= 1, cleared.deleted.reminders);
    check("cleared follow-ups", cleared.deleted.followUps >= 1, cleared.deleted.followUps);
    check("cleared customers", cleared.deleted.customers >= 1, cleared.deleted.customers);
    check("cleared products", cleared.deleted.products >= 1, cleared.deleted.products);

    const remaining = {
      suppliers: await prisma.supplier.count({ where: { userId: userA.id } }),
      purchases: await prisma.purchase.count({ where: { userId: userA.id } }),
      purchaseItems: await prisma.purchaseItem.count({
        where: { purchase: { userId: userA.id } },
      }),
      supplierPayments: await prisma.supplierPayment.count({ where: { userId: userA.id } }),
      reminders: await prisma.reminder.count({ where: { userId: userA.id } }),
      followUps: await prisma.followUp.count({ where: { userId: userA.id } }),
      customers: await prisma.customer.count({ where: { userId: userA.id } }),
      products: await prisma.product.count({ where: { userId: userA.id } }),
    };
    check(
      "no business rows remain",
      Object.values(remaining).every((count) => count === 0),
      JSON.stringify(remaining),
    );

    const setting = await prisma.setting.findUnique({ where: { userId: userA.id } });
    check("settings are kept", setting?.businessName === "Audit Wholesale", setting?.businessName ?? "missing");

    const afterLogs = await listAuditLogs(userA.id);
    check("audit history is kept", afterLogs.length >= before, `${before} -> ${afterLogs.length}`);
    check(
      "clear action is recorded",
      afterLogs.some((row) => row.action === "data.clear"),
    );

    // Reminder was cleared with the rest of the business data.
    const goneReminder = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    check("the cleared reminder is gone", goneReminder === null);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
