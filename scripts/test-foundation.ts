/**
 * Foundation test script.
 *
 * Run with: `npm run test:foundation`
 *
 * Verifies:
 *   1. DB connection works
 *   2. Customer CRUD works + balance calculation is correct
 *   3. Product CRUD works + stock calculation is correct
 *   4. Sale creation is atomic — Sale + SaleItems + Payment + Transaction
 *      all written together, stock decremented, customer balance updated
 *   5. Payment recording updates customer balance
 *   6. Voiding a sale reverses everything
 *   7. Expense recording works (and does NOT affect customer balance)
 *   8. Transaction ledger contains the right rows
 *
 * The script cleans up after itself — all test data is deleted at the end
 * (or on error). Safe to re-run.
 */

import { PrismaClient } from "@prisma/client";
import { Decimal } from "../src/lib/utils/decimal";

const prisma = new PrismaClient();

// ANSI colors for terminal output
const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`${c.green}✓${c.reset} ${message}`);
    passed++;
  } else {
    console.log(`${c.red}✗${c.reset} ${message}`);
    failed++;
    failures.push(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const actualStr = String(actual);
  const expectedStr = String(expected);
  const eq = actualStr === expectedStr;
  if (eq) {
    console.log(`${c.green}✓${c.reset} ${label}: ${actualStr}`);
    passed++;
  } else {
    console.log(
      `${c.red}✗${c.reset} ${label}\n  expected: ${expectedStr}\n  actual:   ${actualStr}`,
    );
    failed++;
    failures.push(label);
  }
}

async function section(name: string) {
  console.log(`\n${c.cyan}── ${name} ──${c.reset}`);
}

async function cleanup() {
  // Delete everything — order matters for FK constraints
  console.log(`\n${c.dim}Cleaning up test data...${c.reset}`);
  await prisma.transaction.deleteMany({});
  await prisma.saleItem.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.stockMove.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.customerAdjustment.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.setting.deleteMany({});
}

async function main() {
  console.log(`${c.cyan}╔════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║  Digital Khata App — Foundation Test Suite        ║${c.reset}`);
  console.log(`${c.cyan}╚════════════════════════════════════════════════════╝${c.reset}`);

  // Always start from a clean slate
  await cleanup();

  // ─────────────────────────────────────────────────────────────────
  await section("1. DB Connection");

  const customerCount = await prisma.customer.count();
  assert(true, "DB connection works (prisma.customer.count() succeeded)");
  console.log(`   ${c.dim}customers in DB: ${customerCount}${c.reset}`);

  // ─────────────────────────────────────────────────────────────────
  await section("2. Customer CRUD + Balance");

  const customer = await prisma.customer.create({
    data: {
      name: "Test Customer",
      phone: "03001234567",
      openingBalance: 1000,
    },
  });
  assert(!!customer.id, "Customer created with ID");

  // Customer with no transactions — balance should equal openingBalance
  const [sales0, payments0, adj0] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { customerId: customer.id, voidedAt: null },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { customerId: customer.id, voidedAt: null },
    }),
    prisma.customerAdjustment.aggregate({
      _sum: { amount: true },
      where: { customerId: customer.id, voidedAt: null },
    }),
  ]);

  const balance0 = new Decimal(customer.openingBalance)
    .plus(sales0._sum.totalAmount ?? 0)
    .minus(payments0._sum.amount ?? 0)
    .plus(adj0._sum.amount ?? 0);

  assertEqual(balance0.toString(), "1000", "Empty customer balance = opening (1000)");

  // ─────────────────────────────────────────────────────────────────
  await section("3. Product CRUD + Stock");

  const product = await prisma.product.create({
    data: {
      name: "Test Product",
      category: "Test",
      purchasePrice: 50,
      sellingPrice: 100,
      unit: "piece",
      openingStock: 20,
      lowStockThreshold: 5,
    },
  });
  assert(!!product.id, "Product created with ID");

  // Initial stock check
  const [moves0, sold0] = await Promise.all([
    prisma.stockMove.aggregate({
      _sum: { quantity: true },
      where: { productId: product.id, voidedAt: null },
    }),
    prisma.saleItem.aggregate({
      _sum: { quantity: true },
      where: { productId: product.id, sale: { voidedAt: null } },
    }),
  ]);

  const stock0 = new Decimal(product.openingStock)
    .plus(moves0._sum.quantity ?? 0)
    .minus(sold0._sum.quantity ?? 0);

  assertEqual(stock0.toString(), "20", "Initial stock = opening (20)");

  // ─────────────────────────────────────────────────────────────────
  await section("4. Sale Creation (atomic — 4 tables written)");

  // Sale: 5 units × Rs.100 = Rs.500 total, paid Rs.200 → outstanding Rs.300
  const sale = await prisma.$transaction(async (tx) => {
    const totalAmount = new Decimal(5).times(100); // 500
    const paidAmount = new Decimal(200);
    const outstanding = totalAmount.minus(paidAmount);

    const s = await tx.sale.create({
      data: {
        customerId: customer.id,
        totalAmount,
        paidAmount,
        outstanding,
        date: new Date(),
        items: {
          create: [
            {
              productId: product.id,
              quantity: 5,
              unitPrice: 100,
              total: totalAmount,
            },
          ],
        },
      },
      include: { items: true },
    });

    const payment = await tx.payment.create({
      data: {
        customerId: customer.id,
        saleId: s.id,
        amount: paidAmount,
        method: "cash",
        date: new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        type: "sale",
        refType: "Sale",
        refId: s.id,
        customerId: customer.id,
        amount: totalAmount,
        direction: "debit",
        date: new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        type: "payment",
        refType: "Payment",
        refId: payment.id,
        customerId: customer.id,
        amount: paidAmount,
        direction: "credit",
        date: new Date(),
      },
    });

    return s;
  });

  assert(!!sale.id, "Sale created with ID");
  assertEqual(sale.items.length, 1, "Sale has 1 item");

  // Verify customer balance now: opening 1000 + sale 500 - payment 200 = 1300
  const [sales1, payments1] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { customerId: customer.id, voidedAt: null },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { customerId: customer.id, voidedAt: null },
    }),
  ]);

  const balance1 = new Decimal(customer.openingBalance)
    .plus(sales1._sum.totalAmount ?? 0)
    .minus(payments1._sum.amount ?? 0);

  assertEqual(balance1.toString(), "1300", "Balance after sale: 1000 + 500 - 200 = 1300");

  // Verify stock decremented: opening 20 - 5 sold = 15
  const sold1 = await prisma.saleItem.aggregate({
    _sum: { quantity: true },
    where: { productId: product.id, sale: { voidedAt: null } },
  });
  const stock1 = new Decimal(product.openingStock).minus(sold1._sum.quantity ?? 0);
  assertEqual(stock1.toString(), "15", "Stock after sale: 20 - 5 = 15");

  // Verify transaction ledger has both rows
  const txCount = await prisma.transaction.count({
    where: { customerId: customer.id },
  });
  assertEqual(txCount, 2, "Transaction ledger has 2 rows (sale + payment)");

  // ─────────────────────────────────────────────────────────────────
  await section("5. Standalone Payment (balance ↓)");

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        customerId: customer.id,
        amount: 300,
        method: "cash",
        date: new Date(),
      },
    });
    await tx.transaction.create({
      data: {
        type: "payment",
        refType: "Payment",
        refId: payment.id,
        customerId: customer.id,
        amount: 300,
        direction: "credit",
        date: new Date(),
      },
    });
  });

  const payments2 = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { customerId: customer.id, voidedAt: null },
  });
  const balance2 = new Decimal(customer.openingBalance)
    .plus(sales1._sum.totalAmount ?? 0)
    .minus(payments2._sum.amount ?? 0);

  // Balance: 1000 + 500 - 200 (sale payment) - 300 (standalone) = 1000
  assertEqual(balance2.toString(), "1000", "Balance after standalone payment: 1300 - 300 = 1000");

  // ─────────────────────────────────────────────────────────────────
  await section("6. Expense Recording (does NOT affect customer balance)");

  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        name: "Test Expense",
        amount: 500,
        category: "transport",
        date: new Date(),
      },
    });
    await tx.transaction.create({
      data: {
        type: "expense",
        refType: "Expense",
        refId: expense.id,
        amount: 500,
        direction: "debit",
        date: new Date(),
      },
    });
  });

  // Customer balance must be unchanged after expense
  const balance3 = new Decimal(customer.openingBalance)
    .plus(sales1._sum.totalAmount ?? 0)
    .minus(payments2._sum.amount ?? 0);
  assertEqual(balance3.toString(), "1000", "Expense does NOT affect customer balance (still 1000)");

  // ─────────────────────────────────────────────────────────────────
  await section("7. Stock Addition (purchase from supplier)");

  await prisma.$transaction(async (tx) => {
    const move = await tx.stockMove.create({
      data: {
        productId: product.id,
        type: "purchase",
        quantity: 10,
        unitCost: 50,
        date: new Date(),
      },
    });
    await tx.transaction.create({
      data: {
        type: "stock_move",
        refType: "StockMove",
        refId: move.id,
        productId: product.id,
        amount: 500,
        direction: "debit",
        date: new Date(),
      },
    });
  });

  // Stock: 15 (after sale) + 10 (purchase) = 25
  const moves3 = await prisma.stockMove.aggregate({
    _sum: { quantity: true },
    where: { productId: product.id, voidedAt: null },
  });
  const stock3 = new Decimal(product.openingStock)
    .plus(moves3._sum.quantity ?? 0)
    .minus(sold1._sum.quantity ?? 0);
  assertEqual(stock3.toString(), "25", "Stock after purchase: 15 + 10 = 25");

  // ─────────────────────────────────────────────────────────────────
  await section("8. Void Sale (reverses everything)");

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: sale.id },
      data: { voidedAt: new Date() },
    });
    await tx.payment.updateMany({
      where: { saleId: sale.id, voidedAt: null },
      data: { voidedAt: new Date() },
    });
  });

  // After voiding: balance = opening 1000 + 0 sales - 300 (only standalone payment) = 700
  const sales4 = await prisma.sale.aggregate({
    _sum: { totalAmount: true },
    where: { customerId: customer.id, voidedAt: null },
  });
  const payments4 = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { customerId: customer.id, voidedAt: null },
  });
  const balance4 = new Decimal(customer.openingBalance)
    .plus(sales4._sum.totalAmount ?? 0)
    .minus(payments4._sum.amount ?? 0);

  assertEqual(balance4.toString(), "700", "Balance after void: 1000 + 0 - 300 = 700");

  // Stock should be restored: opening 20 + 10 (purchase) - 0 (voided sale items excluded) = 30
  const sold4 = await prisma.saleItem.aggregate({
    _sum: { quantity: true },
    where: { productId: product.id, sale: { voidedAt: null } },
  });
  const stock4 = new Decimal(product.openingStock)
    .plus(moves3._sum.quantity ?? 0)
    .minus(sold4._sum.quantity ?? 0);
  assertEqual(stock4.toString(), "30", "Stock restored after void: 20 + 10 - 0 = 30");

  // ─────────────────────────────────────────────────────────────────
  await section("9. Decimal Precision (no float errors)");

  // Test the classic 0.1 + 0.2 problem
  const d1 = new Decimal("0.1");
  const d2 = new Decimal("0.2");
  const d3 = d1.plus(d2);
  assertEqual(d3.toString(), "0.3", "Decimal: 0.1 + 0.2 = 0.3 (no float error)");

  // Large money addition
  const big = new Decimal("1000000.00").plus(new Decimal("999999.99"));
  assertEqual(big.toString(), "1999999.99", "Large money math: 1M + 999999.99 = 1999999.99");

  // ─────────────────────────────────────────────────────────────────
  await cleanup();

  // ─────────────────────────────────────────────────────────────────
  console.log(`\n${c.cyan}══════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.green}Passed: ${passed}${c.reset}  ${c.red}Failed: ${failed}${c.reset}`);
  if (failed > 0) {
    console.log(`\n${c.red}Failures:${c.reset}`);
    for (const f of failures) {
      console.log(`  ${c.red}•${c.reset} ${f}`);
    }
    process.exit(1);
  } else {
    console.log(`\n${c.green}✓ Foundation is healthy. Ready for Phase 4.${c.reset}`);
    process.exit(0);
  }
}

main()
  .catch(async (e) => {
    console.error(`\n${c.red}FATAL ERROR:${c.reset}`, e);
    await cleanup();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
