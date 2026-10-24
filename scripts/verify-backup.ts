/**
 * Verifies that a full backup really contains — and really restores — the
 * newer business data, not just the original khata tables.
 *
 * What must be true:
 *   - Suppliers, purchases, purchase items, supplier payments, reminders and
 *     follow-ups are exported.
 *   - Discounts, due dates, next-follow-up dates and the supplier link on the
 *     ledger survive a round trip.
 *   - Restoring a backup puts everything back exactly, and never touches
 *     another business's rows.
 *   - A backup made before these tables existed still imports (with empty new
 *     tables) instead of failing.
 *   - A backup with a dangling foreign key is rejected before anything is
 *     deleted.
 *
 * Run: npx tsx scripts/verify-backup.ts
 */

import { prisma } from "@/lib/db/prisma";
import { createCustomer } from "@/lib/services/customers";
import { createProduct, getProductStock } from "@/lib/services/products";
import { createSale } from "@/lib/services/sales";
import { createSupplier } from "@/lib/services/suppliers";
import { createPurchase } from "@/lib/services/purchases";
import { createSupplierPayment } from "@/lib/services/supplier-payments";
import { createReminder } from "@/lib/services/reminders";
import { createFollowUp } from "@/lib/services/follow-ups";
import { exportBackup, importBackup, type BackupFile } from "@/lib/services/backup";

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

async function main() {
  const stamp = Date.now();
  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "Backup Test A", email: `bka_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Backup Test B", email: `bkb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const customer = await createCustomer({ name: "Backup Customer", phone: "03001234567" }, userA.id);
    const otherCustomer = await createCustomer({ name: "Other Business Customer" }, userB.id);
    const product = await createProduct(
      {
        name: "Backup Item",
        unit: "piece",
        purchasePrice: 100,
        sellingPrice: 150,
        openingStock: 100,
        lowStockThreshold: 5,
      },
      userA.id,
    );

    const dueDateInput = "2026-10-30";
    const sale = await createSale(
      {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 2, unitPrice: 150 }],
        paidAmount: 100,
        discountAmount: 50,
        dueDate: dueDateInput,
      },
      userA.id,
    );

    const supplier = await createSupplier(
      { name: "Backup Supplier", openingBalance: 250 },
      userA.id,
    );
    const purchase = await createPurchase(
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitCost: 100, batchName: "Backup batch" }],
        paidAmount: 400,
      },
      userA.id,
    );
    const supplierPayment = await createSupplierPayment(
      { supplierId: supplier.id, purchaseId: purchase.id, amount: 200 },
      userA.id,
    );

    const reminder = await createReminder(
      {
        title: "Call about backup order",
        type: "customer_followup",
        dueAt: new Date(),
        customerId: customer.id,
      },
      userA.id,
    );
    const { followUp } = await createFollowUp(
      {
        customerId: customer.id,
        productId: product.id,
        kind: "reorder",
        reason: "Bought this 3 times, usually every 20 days",
        message: "Would you like the usual order?",
      },
      userA.id,
    );

    const followUpAt = new Date();
    await prisma.customer.update({
      where: { id: customer.id },
      data: { nextFollowUpAt: followUpAt },
    });

    const originalDue = (
      await prisma.sale.findUnique({ where: { id: sale.id }, select: { dueDate: true } })
    )?.dueDate?.toISOString();
    check("setup saved a due date", !!originalDue);

    // ── Export ──
    console.log("\n== Export ==");
    const exported = await exportBackup(userA.id);
    check("supplier exported", exported.counts.suppliers === 1, exported.counts.suppliers);
    check("purchase exported", exported.counts.purchases === 1, exported.counts.purchases);
    check("purchase item exported", exported.counts.purchaseItems === 1, exported.counts.purchaseItems);
    check("supplier payment exported", exported.counts.supplierPayments === 1, exported.counts.supplierPayments);
    check("reminder exported", exported.counts.reminders === 1, exported.counts.reminders);
    check("follow-up exported", exported.counts.followUps === 1, exported.counts.followUps);

    const saleRow = exported.data.sales.find((s) => s.id === sale.id);
    check("sale discount exported", String(saleRow?.discountAmount) === "50", String(saleRow?.discountAmount));
    check("sale due date exported", String(saleRow?.dueDate) === originalDue, String(saleRow?.dueDate));

    const customerRow = exported.data.customers.find((c) => c.id === customer.id);
    check("next follow-up date exported", !!customerRow?.nextFollowUpAt);

    const supplierRow = exported.data.suppliers.find((s) => s.id === supplier.id);
    check("supplier opening balance exported", String(supplierRow?.openingBalance) === "250", String(supplierRow?.openingBalance));

    const purchaseItemRow = exported.data.purchaseItems.find((p) => p.purchaseId === purchase.id);
    check("purchase item stock move exported", !!purchaseItemRow?.stockMoveId);

    const supplierLedger = exported.data.transactions.filter((t) => t.supplierId === supplier.id);
    check("supplier ledger link exported", supplierLedger.length >= 1, supplierLedger.length);

    // ── Corrupt backup is rejected before deletion ──
    console.log("\n== Integrity guard ==");
    const corrupt = JSON.parse(JSON.stringify(exported)) as BackupFile;
    corrupt.data.purchases.push({
      id: "bad-purchase",
      supplierId: "does-not-exist",
      totalAmount: "1",
      paidAmount: "0",
      outstanding: "1",
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await expectFailure("dangling supplier reference is rejected", () =>
      importBackup(JSON.stringify(corrupt), { confirmReplace: true }, userA.id),
    );
    check(
      "rejected import changed nothing",
      (await prisma.supplier.count({ where: { userId: userA.id } })) === 1,
    );

    // ── Mutate, then restore ──
    console.log("\n== Restore ==");
    await prisma.supplierPayment.deleteMany({ where: { userId: userA.id } });
    await prisma.purchaseItem.deleteMany({ where: { purchase: { userId: userA.id } } });
    await prisma.purchase.deleteMany({ where: { userId: userA.id } });
    await prisma.reminder.deleteMany({ where: { userId: userA.id } });
    await prisma.followUp.deleteMany({ where: { userId: userA.id } });
    await prisma.supplier.deleteMany({ where: { userId: userA.id } });
    await prisma.sale.update({
      where: { id: sale.id },
      data: { discountAmount: 0, dueDate: null },
    });
    await prisma.customer.update({
      where: { id: customer.id },
      data: { nextFollowUpAt: null },
    });

    const result = await importBackup(
      JSON.stringify(exported),
      { confirmReplace: true },
      userA.id,
    );
    check("import reports success", result.success === true);
    check("import reports suppliers", result.imported.suppliers === 1, result.imported.suppliers);
    check("import reports purchases", result.imported.purchases === 1, result.imported.purchases);
    check("import reports reminders", result.imported.reminders === 1, result.imported.reminders);
    check("import reports follow-ups", result.imported.followUps === 1, result.imported.followUps);

    const saleAfter = await prisma.sale.findUnique({ where: { id: sale.id } });
    check("discount restored", saleAfter?.discountAmount.toString() === "50", saleAfter?.discountAmount.toString());
    check(
      "due date restored exactly",
      saleAfter?.dueDate?.toISOString() === originalDue,
      saleAfter?.dueDate?.toISOString(),
    );

    const supplierAfter = await prisma.supplier.findUnique({ where: { id: supplier.id } });
    check("supplier restored", !!supplierAfter);
    check(
      "supplier opening balance restored",
      supplierAfter?.openingBalance.toString() === "250",
      supplierAfter?.openingBalance.toString(),
    );

    const purchaseAfter = await prisma.purchase.findUnique({
      where: { id: purchase.id },
      include: { items: { include: { stockMove: true } } },
    });
    check("purchase restored", !!purchaseAfter);
    check("purchase item restored", purchaseAfter?.items.length === 1, purchaseAfter?.items.length);
    check(
      "purchase item batch restored",
      purchaseAfter?.items[0]?.stockMove?.batchName === "Backup batch",
      String(purchaseAfter?.items[0]?.stockMove?.batchName),
    );

    const paymentAfter = await prisma.supplierPayment.findUnique({
      where: { id: supplierPayment.id },
    });
    check("supplier payment restored", !!paymentAfter);

    const reminderAfter = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    check("reminder restored", !!reminderAfter);

    const followUpAfter = await prisma.followUp.findUnique({ where: { id: followUp.id } });
    check("follow-up restored", !!followUpAfter);
    check(
      "follow-up message restored",
      followUpAfter?.message === "Would you like the usual order?",
      String(followUpAfter?.message),
    );

    const customerAfter = await prisma.customer.findUnique({ where: { id: customer.id } });
    check("next follow-up date restored", !!customerAfter?.nextFollowUpAt);

    const supplierTxAfter = await prisma.transaction.findFirst({
      where: { userId: userA.id, supplierId: supplier.id },
    });
    check("supplier ledger link restored", !!supplierTxAfter);

    const stock = await getProductStock(product.id);
    check("stock rebuilt without double counting", stock.toString() === "108", stock.toString());

    const otherAfter = await prisma.customer.findFirst({ where: { id: otherCustomer.id } });
    check("other business untouched", !!otherAfter);

    // ── Old backup (no new tables) still imports ──
    console.log("\n== Backward compatibility ==");
    const old = JSON.parse(JSON.stringify(exported)) as Record<string, unknown>;
    const oldData = old.data as Record<string, unknown>;
    delete oldData.suppliers;
    delete oldData.purchases;
    delete oldData.purchaseItems;
    delete oldData.supplierPayments;
    delete oldData.reminders;
    delete oldData.followUps;

    const oldResult = await importBackup(
      JSON.stringify(old),
      { confirmReplace: true },
      userA.id,
    );
    check("old backup imports", oldResult.success === true);
    check("old backup restores zero suppliers", oldResult.imported.suppliers === 0, oldResult.imported.suppliers);
    check(
      "old backup clears newer tables",
      (await prisma.supplier.count({ where: { userId: userA.id } })) === 0,
    );
    check(
      "old backup keeps sales",
      (await prisma.sale.count({ where: { userId: userA.id } })) === 1,
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
