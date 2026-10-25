/**
 * Verifies the Purchase + SupplierPayment modules end-to-end against a real DB.
 * Run: npx tsx scripts/verify-purchases.ts
 *
 * Creates two throw-away businesses, exercises the real service functions,
 * and cleans up. Safe to run repeatedly. Does NOT touch existing data.
 */

import { prisma } from "@/lib/db/prisma";
import { createSupplier, getSupplierBalance } from "@/lib/services/suppliers";
import { createPurchase, getPurchase, listPurchasesBySupplier, voidPurchase } from "@/lib/services/purchases";
import {
  createSupplierPayment,
  listSupplierPayments,
  voidSupplierPayment,
} from "@/lib/services/supplier-payments";
import { createProduct, getProductStock } from "@/lib/services/products";
import { getOverduePayables } from "@/lib/services/payables";
import { dateStringInTz } from "@/lib/utils/date";

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

async function main() {
  const stamp = Date.now();
  console.log("\n── Setup ──");
  const userA = await prisma.user.create({
    data: { name: "Purchase Test A", email: `pa_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Purchase Test B", email: `pb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const supplier = await createSupplier({ name: "Rice Mill", openingBalance: 0 }, userA.id);
    const product = await createProduct(
      { name: "Basmati Rice", unit: "kg", purchasePrice: 100, sellingPrice: 150, lowStockThreshold: 5 },
      userA.id,
    );

    const stock0 = await getProductStock(product.id);
    check("starting stock is 0", stock0.toString() === "0", `got ${stock0.toString()}`);

    // ── Test 1: purchase adds stock + records payable ──
    console.log("\n── Test 1: create purchase ──");
    const purchase = await createPurchase(
      {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitCost: 100, batchName: "Oct batch" }],
        paidAmount: 400,
      },
      userA.id,
    );
    check("purchase total = 10 × 100 = 1000", purchase.totalAmount === "1000", purchase.totalAmount);
    check("paid at purchase = 400", purchase.paidAmount === "400", purchase.paidAmount);
    check("outstanding = 600", purchase.outstanding === "600", purchase.outstanding);
    check("batch name saved", purchase.items[0]?.batchName === "Oct batch", String(purchase.items[0]?.batchName));

    const stock1 = await getProductStock(product.id);
    check("stock increased to 10", stock1.toString() === "10", stock1.toString());

    const bal1 = await getSupplierBalance(supplier.id);
    check("payable = 600 (no opening balance)", bal1.balance === "600", bal1.balance);
    check("total purchases = 1000", bal1.totalPurchases === "1000", bal1.totalPurchases);

    // ── Test 2: duplicate submit is rejected ──
    console.log("\n── Test 2: duplicate-submit guard ──");
    await expectFailure("identical purchase within 60s is rejected", () =>
      createPurchase(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 10, unitCost: 100 }],
          paidAmount: 400,
        },
        userA.id,
      ),
    );

    // ── Test 3: part-payment reduces payable ──
    console.log("\n── Test 3: supplier payment ──");
    const payment = await createSupplierPayment(
      { supplierId: supplier.id, purchaseId: purchase.id, amount: 200, method: "cash" },
      userA.id,
    );
    check("payment amount = 200", payment.amount === "200", payment.amount);

    const bal2 = await getSupplierBalance(supplier.id);
    check("payable now = 400", bal2.balance === "400", bal2.balance);
    check("total payments = 200", bal2.totalPayments === "200", bal2.totalPayments);

    const purchases = await listPurchasesBySupplier(supplier.id, userA.id);
    check("invoice shows 200 paid since creation", purchases[0]?.paidSince === "200", String(purchases[0]?.paidSince));
    check("invoice remaining = 400", purchases[0]?.remaining === "400", String(purchases[0]?.remaining));

    const ledger = await prisma.transaction.findFirst({
      where: { refType: "SupplierPayment", refId: payment.id },
    });
    check("ledger row created for supplier payment", !!ledger && ledger.type === "supplier_payment");
    check("ledger row is money-out (credit)", ledger?.direction === "credit", ledger?.direction ?? "");

    // ── Test 4: overpaying an invoice is rejected ──
    console.log("\n── Test 4: overpayment guard ──");
    await expectFailure("payment above invoice remaining is rejected", () =>
      createSupplierPayment(
        { supplierId: supplier.id, purchaseId: purchase.id, amount: 9999, method: "cash" },
        userA.id,
      ),
    );

    // ── Test 5: tenant isolation ──
    console.log("\n── Test 5: tenant isolation ──");
    await expectFailure("business B cannot buy from A's supplier", () =>
      createPurchase(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 1, unitCost: 100 }],
          paidAmount: 0,
        },
        userB.id,
      ),
    );
    await expectFailure("business B cannot list A's purchases", () =>
      listPurchasesBySupplier(supplier.id, userB.id),
    );
    await expectFailure("business B cannot pay A's supplier", () =>
      createSupplierPayment({ supplierId: supplier.id, amount: 10, method: "cash" }, userB.id),
    );

    // ── Test 6: void is blocked when stock has been sold ──
    console.log("\n── Test 6: void guards ──");
    const move = await prisma.stockMove.findFirst({ where: { productId: product.id, type: "purchase" } });
    if (!move) throw new Error("stock move not found");
    await prisma.stockMove.update({ where: { id: move.id }, data: { remainingQuantity: 5 } });
    await expectFailure("cannot void a purchase whose stock was (partly) sold", () =>
      voidPurchase(purchase.id, userA.id),
    );
    await prisma.stockMove.update({ where: { id: move.id }, data: { remainingQuantity: 10 } });

    // ── Test 7: voiding restores stock + payable ──
    console.log("\n── Test 7: void purchase ──");
    const voided = await voidPurchase(purchase.id, userA.id);
    check("purchase voided", !!voided.voidedAt);

    const stock2 = await getProductStock(product.id);
    check("stock back to 0 after void", stock2.toString() === "0", stock2.toString());

    const bal3 = await getSupplierBalance(supplier.id);
    // payment 200 remains, purchase gone → balance = 0 - 200 = -200 (advance)
    check("payable becomes -200 (advance) after void", bal3.balance === "-200", bal3.balance);

    // ── Test 8: void payment restores payable ──
    console.log("\n── Test 8: void supplier payment ──");
    await voidSupplierPayment(payment.id, userA.id);
    const bal4 = await getSupplierBalance(supplier.id);
    check("payable back to 0 after voiding payment", bal4.balance === "0", bal4.balance);

    const ledgerGone = await prisma.transaction.findFirst({
      where: { refType: "SupplierPayment", refId: payment.id },
    });
    check("ledger row removed when payment voided", ledgerGone === null);

    const payments = await listSupplierPayments(supplier.id, userA.id);
    check("voided payment still listed (audit trail)", payments.length === 1 && !!payments[0]?.voidedAt);

    // ── Test 9: due dates + overdue payables allocation ──────────────
    console.log("\n── Test 9: purchase due dates and overdue payables ──");
    const dueSupplier = await createSupplier(
      { name: "Due Date Supplier", openingBalance: 0 },
      userA.id,
    );
    const tenDaysAgo = dateStringInTz(new Date(Date.now() - 10 * 86_400_000));
    const yesterday = dateStringInTz(new Date(Date.now() - 86_400_000));

    const oldInvoice = await createPurchase(
      {
        supplierId: dueSupplier.id,
        items: [{ productId: product.id, quantity: 1, unitCost: 1000 }],
        paidAmount: 0,
        dueDate: tenDaysAgo,
      },
      userA.id,
    );
    const recentInvoice = await createPurchase(
      {
        supplierId: dueSupplier.id,
        items: [{ productId: product.id, quantity: 1, unitCost: 500 }],
        paidAmount: 0,
        dueDate: yesterday,
      },
      userA.id,
    );
    const noDueInvoice = await createPurchase(
      {
        supplierId: dueSupplier.id,
        items: [{ productId: product.id, quantity: 1, unitCost: 300 }],
        paidAmount: 0,
      },
      userA.id,
    );

    check(
      "due date stored on the purchase",
      !!oldInvoice.dueDate && dateStringInTz(oldInvoice.dueDate) === tenDaysAgo,
      String(oldInvoice.dueDate),
    );
    check("overdue invoice is flagged", oldInvoice.isOverdue === true);
    check("invoice without a due date is not overdue", noDueInvoice.isOverdue === false);

    // An unlinked payment pays the oldest open invoice first, then the next.
    await createSupplierPayment(
      { supplierId: dueSupplier.id, amount: 1200, method: "cash" },
      userA.id,
    );

    const duePurchases = await listPurchasesBySupplier(dueSupplier.id, userA.id);
    const oldView = duePurchases.find((p) => p.id === oldInvoice.id);
    const recentView = duePurchases.find((p) => p.id === recentInvoice.id);
    const noDueView = duePurchases.find((p) => p.id === noDueInvoice.id);

    check("oldest invoice is fully paid by allocation", oldView?.remaining === "0", String(oldView?.remaining));
    check("recent invoice receives the next allocation", recentView?.remaining === "300", String(recentView?.remaining));
    check("invoice without due date is paid last", noDueView?.remaining === "300", String(noDueView?.remaining));

    const recentSingle = await getPurchase(recentInvoice.id, userA.id);
    check(
      "single-purchase view uses the same allocation as the list",
      recentSingle.remaining === "300",
      recentSingle.remaining,
    );
    await expectFailure(
      "another tenant cannot fetch the purchase",
      () => getPurchase(recentInvoice.id, userB.id),
    );

    const overdue = await getOverduePayables(userA.id);
    check("one overdue payable remains", overdue.count === 1, String(overdue.count));
    check("overdue total is 300", overdue.total === "300", overdue.total);
    check("overdue row is the recent invoice", overdue.rows[0]?.purchaseId === recentInvoice.id, String(overdue.rows[0]?.purchaseId));
    check("days overdue = 1", overdue.rows[0]?.daysOverdue === 1, String(overdue.rows[0]?.daysOverdue));
    check(
      "paid oldest invoice is not listed as overdue",
      !overdue.rows.some((row) => row.purchaseId === oldInvoice.id),
    );
    check(
      "invoice without due date is not listed as overdue",
      !overdue.rows.some((row) => row.purchaseId === noDueInvoice.id),
    );

    const otherOverdue = await getOverduePayables(userB.id);
    check("overdue payables are tenant-isolated", otherOverdue.count === 0 && otherOverdue.total === "0");
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
