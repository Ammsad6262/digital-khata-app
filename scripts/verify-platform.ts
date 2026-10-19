/**
 * Platform verification script (Stage 1).
 *
 * Proves, against the real database:
 *   1. Tenant isolation — one business cannot see another's customers/suppliers.
 *   2. Supplier payable math — opening + purchases - payments.
 *   3. The searchCustomers cross-tenant leak is actually fixed.
 *
 * Run: npx tsx scripts/verify-platform.ts
 * Safe: creates its own test users and deletes them at the end.
 */

import { prisma } from "@/lib/db/prisma";
import { searchCustomers, createCustomer } from "@/lib/services/customers";
import {
  createSupplier,
  listSuppliersWithBalance,
  getSupplierBalance,
  searchSuppliers,
} from "@/lib/services/suppliers";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const stamp = Date.now();
  const emailA = `verify-a-${stamp}@test.local`;
  const emailB = `verify-b-${stamp}@test.local`;

  console.log("\n── Setting up two independent businesses ──");
  const userA = await prisma.user.create({
    data: { name: "Verify A", email: emailA, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Verify B", email: emailB, passwordHash: "x" },
  });

  try {
    // ── Test 1: customer search tenant isolation (the reported leak) ──
    console.log("\n── Test 1: cross-tenant customer search leak ──");
    await createCustomer({ name: "Zaid Traders A", phone: `0300${stamp % 10000000}`, openingBalance: 0 }, userA.id);
    await createCustomer({ name: "Zaid Traders B", phone: `0311${stamp % 10000000}`, openingBalance: 0 }, userB.id);

    const aResults = await searchCustomers("Zaid Traders", userA.id);
    const bResults = await searchCustomers("Zaid Traders", userB.id);

    check("business A search returns only A's customer", aResults.length === 1 && aResults[0]?.name === "Zaid Traders A",
      `got ${aResults.map((r) => r.name).join(", ") || "(none)"}`);
    check("business B search returns only B's customer", bResults.length === 1 && bResults[0]?.name === "Zaid Traders B",
      `got ${bResults.map((r) => r.name).join(", ") || "(none)"}`);
    check("A cannot see B's customer row", !aResults.some((r) => r.name === "Zaid Traders B"));

    // ── Test 2: supplier list tenant isolation ──
    console.log("\n── Test 2: supplier list isolation ──");
    await createSupplier({ name: "Supplier A Only", openingBalance: 0 }, userA.id);
    await createSupplier({ name: "Supplier B Only", openingBalance: 0 }, userB.id);

    const aSuppliers = await listSuppliersWithBalance(userA.id);
    const bSuppliers = await listSuppliersWithBalance(userB.id);
    check("A's supplier list contains only A's supplier",
      aSuppliers.length === 1 && aSuppliers[0]?.name === "Supplier A Only",
      `got ${aSuppliers.map((s) => s.name).join(", ")}`);
    check("B's supplier list contains only B's supplier",
      bSuppliers.length === 1 && bSuppliers[0]?.name === "Supplier B Only",
      `got ${bSuppliers.map((s) => s.name).join(", ")}`);

    const aSearch = await searchSuppliers("Supplier", userA.id);
    check("supplier search is tenant-scoped", aSearch.every((s) => s.name !== "Supplier B Only"));

    // ── Test 3: supplier payable math ──
    console.log("\n── Test 3: supplier payable math ──");
    const supplier = await createSupplier({ name: "Math Supplier", openingBalance: 1000 }, userA.id);

    // Insert a purchase (1000 + 2500) and a supplier payment of 1200 directly.
    await prisma.purchase.create({
      data: { userId: userA.id, supplierId: supplier.id, totalAmount: 2500, paidAmount: 0, outstanding: 2500 },
    });
    await prisma.supplierPayment.create({
      data: { userId: userA.id, supplierId: supplier.id, amount: 1200, method: "cash" },
    });

    const bal = await getSupplierBalance(supplier.id);
    // 1000 opening + 2500 purchases - 1200 paid = 2300
    check("payable = opening(1000) + purchases(2500) - payments(1200) = 2300", bal.balance === "2300", `got ${bal.balance}`);

    const listWithBal = await listSuppliersWithBalance(userA.id);
    const mathSupplier = listWithBal.find((s) => s.id === supplier.id);
    check("list endpoint reports the same payable", mathSupplier?.balance === "2300", `got ${mathSupplier?.balance}`);

    // ── Test 4: soft-delete guard ──
    console.log("\n── Test 4: delete guard ──");
    const { deleteSupplier } = await import("@/lib/services/suppliers");
    let blocked = false;
    try {
      await deleteSupplier(supplier.id, userA.id);
    } catch {
      blocked = true;
    }
    check("supplier with purchases/payments cannot be deleted", blocked);
  } finally {
    console.log("\n── Cleanup ──");
    // Cascade deletes remove customers, suppliers, purchases, payments.
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    // Safety net for customer search test (customer is linked to user → cascaded).
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
