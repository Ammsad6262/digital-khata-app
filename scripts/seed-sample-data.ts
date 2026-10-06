/**
 * Sample data seeder.
 *
 * Populates the DB with realistic Pakistani wholesale business data so we can
 * visually verify the dashboard. Run with:
 *
 *   npm run db:seed
 *
 * The script:
 *   - Wipes existing data first (idempotent — safe to re-run)
 *   - Creates 8 customers (some with opening balances)
 *   - Creates 6 products (with various stock levels, some low)
 *   - Records 12 sales across the past week (some today)
 *   - Records 10 payments across the past week (some today)
 *   - Records 6 expenses across the past week (some today)
 *   - Records 4 stock purchases
 *
 * All amounts are in PKR. Phone numbers use the Pakistani format (03XX).
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import { Decimal } from "../src/lib/utils/decimal";

const DEMO_EMAIL = process.argv[2] ?? "demo@example.com";
const DEMO_PASSWORD = "password";

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function hoursAgo(h: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - h);
  return d;
}

function daysAgo(d: number, hour = 10): Date {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function cleanup() {
  console.log("🧹 Cleaning existing data...");
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

// ────────────────────────────────────────────────────────────────────────────
// Customers
// ────────────────────────────────────────────────────────────────────────────

type CustomerSeed = {
  name: string;
  phone: string;
  address?: string;
  openingBalance: number;
};

const CUSTOMERS: CustomerSeed[] = [
  { name: "Ahmed Khan",        phone: "03001234567", address: "Saddar, Karachi",      openingBalance: 25000 },
  { name: "Bilal Traders",     phone: "03014567890", address: " Bolton Market, Karachi", openingBalance: 0 },
  { name: "Imran Stores",      phone: "03215678901", address: "Korangi, Karachi",     openingBalance: 45000 },
  { name: "Kashif Mobile Shop", phone: "03337890123", address: "Gulshan, Karachi",   openingBalance: 12000 },
  { name: "Naveed General Store", phone: "03456789012", address: "Liaquatabad, Karachi", openingBalance: 0 },
  { name: "Sajid Electronics",  phone: "03018901234", address: "Nazimabad, Karachi",   openingBalance: 80000 },
  { name: "Tariq Bazaar",       phone: "03120123456", address: "Hyderi, Karachi",     openingBalance: 5000 },
  { name: "Usman Mart",         phone: "03133456789", address: "North Nazimabad",     openingBalance: 0 },
];

// ────────────────────────────────────────────────────────────────────────────
// Products
// ────────────────────────────────────────────────────────────────────────────

type ProductSeed = {
  name: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  unit: string;
  sku?: string;
  openingStock: number;
  lowStockThreshold: number;
};

const PRODUCTS: ProductSeed[] = [
  { name: "Basmati Rice 25kg",    category: "Grocery",     purchasePrice: 4200, sellingPrice: 4800, unit: "bag",   sku: "RICE-25", openingStock: 50, lowStockThreshold: 5 },
  { name: "Sugar 50kg",           category: "Grocery",     purchasePrice: 5800, sellingPrice: 6200, unit: "bag",   sku: "SUG-50",  openingStock: 30, lowStockThreshold: 5 },
  { name: "Cooking Oil 5L",       category: "Grocery",     purchasePrice: 1850, sellingPrice: 2100, unit: "bottle", sku: "OIL-5L", openingStock: 100, lowStockThreshold: 10 },
  { name: "Nestle Milk Pack 1L",  category: "Dairy",       purchasePrice: 280,  sellingPrice: 320,  unit: "carton", sku: "MILK-1L", openingStock: 8, lowStockThreshold: 10 },
  { name: "Tea Lipton 950g",      category: "Beverages",   purchasePrice: 1450, sellingPrice: 1650, unit: "pack",   sku: "TEA-950", openingStock: 25, lowStockThreshold: 5 },
  { name: "Surf Excel 3kg",       category: "Household",   purchasePrice: 1150, sellingPrice: 1350, unit: "pack",   sku: "SURF-3", openingStock: 4, lowStockThreshold: 5 },
  { name: "Shan Biryani Masala 50g", category: "Spices",   purchasePrice: 95,   sellingPrice: 120,  unit: "box",    sku: "SHAN-BIRYANI", openingStock: 200, lowStockThreshold: 20 },
];

// ────────────────────────────────────────────────────────────────────────────
// Main seed function
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding sample data for Digital Khata App...\n");

  // 1. Create or reuse user
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    console.log(`  Creating user ${DEMO_EMAIL}...`);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    user = await prisma.user.create({
      data: { name: "Demo User", email: DEMO_EMAIL, passwordHash },
    });
  }
  const userId = user.id;
  console.log(`  User ID: ${userId}`);

  await cleanup();

  // ── Create settings ─────────────────────────────────────────────────
  console.log("⚙️  Upserting settings...");
  await prisma.setting.upsert({
    where: { userId },
    create: {
      userId,
      businessName: "Zafar Wholesale Trader",
      currency: "PKR",
      currencySymbol: "Rs.",
      timezone: "Asia/Karachi",
      customUnits: ["carton", "dozen"],
    },
    update: {
      businessName: "Zafar Wholesale Trader",
      currency: "PKR",
      currencySymbol: "Rs.",
      timezone: "Asia/Karachi",
      customUnits: ["carton", "dozen"],
    },
  });

  // ── Create customers ─────────────────────────────────────────────────
  console.log(`👥 Creating ${CUSTOMERS.length} customers...`);
  const customers = await Promise.all(
    CUSTOMERS.map((c) =>
      prisma.customer.create({
        data: {
          name: c.name,
          phone: c.phone,
          address: c.address ?? null,
          openingBalance: c.openingBalance,
        },
      }),
    ),
  );

  // ── Create products ──────────────────────────────────────────────────
  console.log(`📦 Creating ${PRODUCTS.length} products...`);
  const products = await Promise.all(
    PRODUCTS.map((p) =>
      prisma.product.create({
        data: {
          name: p.name,
          category: p.category,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          unit: p.unit,
          sku: p.sku,
          openingStock: p.openingStock,
          lowStockThreshold: p.lowStockThreshold,
        },
      }),
    ),
  );

  // ── Record stock purchases (3 of them, in the past) ─────────────────
  console.log("🚚 Recording 4 stock purchases...");
  const stockPurchases: Array<{ product: typeof products[number]; qty: number; cost: number; daysAgo: number }> = [
    { product: products[0]!, qty: 20, cost: 4200, daysAgo: 7 },  // Rice 20 bags
    { product: products[2]!, qty: 50, cost: 1850, daysAgo: 5 },   // Oil 50 bottles
    { product: products[3]!, qty: 30, cost: 280, daysAgo: 3 },    // Milk 30 cartons
    { product: products[6]!, qty: 100, cost: 95, daysAgo: 2 },    // Shan 100 boxes
  ];

  for (const sp of stockPurchases) {
    await prisma.$transaction(async (tx) => {
      const move = await tx.stockMove.create({
        data: {
          productId: sp.product.id,
          type: "purchase",
          quantity: sp.qty,
          unitCost: sp.cost,
          reason: "Supplier delivery",
          date: daysAgo(sp.daysAgo),
        },
      });
      await tx.transaction.create({
        data: {
          type: "stock_move",
          refType: "StockMove",
          refId: move.id,
          productId: sp.product.id,
          amount: new Decimal(sp.qty).times(sp.cost),
          direction: "debit",
          date: move.date,
        },
      });
    });
  }

  // ── Record sales (12 sales, some today, some in past week) ──────────
  console.log("💰 Recording 12 sales...");
  type SaleSeed = {
    customer: typeof customers[number];
    items: Array<{ product: typeof products[number]; qty: number; price: number }>;
    paid: number;
    hoursAgo?: number;
    daysAgo?: number;
    hour?: number;
  };
  const saleData: SaleSeed[] = [
    // Today's sales (5)
    { customer: customers[0]!, items: [{ product: products[0]!, qty: 2, price: 4800 }, { product: products[4]!, qty: 5, price: 1650 }], paid: 5000, hoursAgo: 2 },
    { customer: customers[1]!, items: [{ product: products[2]!, qty: 3, price: 2100 }], paid: 6300, hoursAgo: 4 },
    { customer: customers[3]!, items: [{ product: products[5]!, qty: 2, price: 1350 }, { product: products[6]!, qty: 10, price: 120 }], paid: 0, hoursAgo: 5 },
    { customer: customers[4]!, items: [{ product: products[0]!, qty: 1, price: 4800 }], paid: 4800, hoursAgo: 6 },
    { customer: customers[6]!, items: [{ product: products[4]!, qty: 3, price: 1650 }, { product: products[6]!, qty: 5, price: 120 }], paid: 1000, hoursAgo: 7 },

    // Yesterday's sales (3)
    { customer: customers[2]!, items: [{ product: products[1]!, qty: 2, price: 6200 }], paid: 5000, daysAgo: 1, hour: 14 },
    { customer: customers[5]!, items: [{ product: products[0]!, qty: 5, price: 4800 }, { product: products[2]!, qty: 10, price: 2100 }], paid: 25000, daysAgo: 1, hour: 11 },
    { customer: customers[7]!, items: [{ product: products[3]!, qty: 5, price: 320 }], paid: 1600, daysAgo: 1, hour: 16 },

    // Earlier in the week (4)
    { customer: customers[0]!, items: [{ product: products[1]!, qty: 1, price: 6200 }], paid: 0, daysAgo: 3, hour: 13 },
    { customer: customers[3]!, items: [{ product: products[5]!, qty: 1, price: 1350 }], paid: 1350, daysAgo: 4, hour: 15 },
    { customer: customers[4]!, items: [{ product: products[2]!, qty: 4, price: 2100 }, { product: products[6]!, qty: 20, price: 120 }], paid: 8000, daysAgo: 5, hour: 10 },
    { customer: customers[6]!, items: [{ product: products[4]!, qty: 2, price: 1650 }], paid: 3300, daysAgo: 6, hour: 12 },
  ];

  for (const s of saleData) {
    const date = s.hoursAgo !== undefined ? hoursAgo(s.hoursAgo) : daysAgo(s.daysAgo ?? 0, s.hour);
    await prisma.$transaction(async (tx) => {
      const items = s.items.map((i) => ({
        productId: i.product.id,
        quantity: new Decimal(i.qty),
        unitPrice: new Decimal(i.price),
        total: new Decimal(i.qty).times(i.price),
      }));
      const totalAmount = items.reduce((sum, i) => sum.plus(i.total), new Decimal(0));
      const paidAmount = new Decimal(s.paid);
      const outstanding = totalAmount.minus(paidAmount);

      const sale = await tx.sale.create({
        data: {
          customerId: s.customer.id,
          totalAmount,
          paidAmount,
          outstanding,
          date,
          items: { create: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
          })) },
        },
      });

      let paymentId: string | null = null;
      if (paidAmount.gt(0)) {
        const payment = await tx.payment.create({
          data: {
            customerId: s.customer.id,
            saleId: sale.id,
            amount: paidAmount,
            method: "cash",
            date,
          },
        });
        paymentId = payment.id;
      }

      await tx.transaction.create({
        data: {
          type: "sale",
          refType: "Sale",
          refId: sale.id,
          customerId: s.customer.id,
          amount: totalAmount,
          direction: "debit",
          date,
        },
      });

      if (paymentId) {
        await tx.transaction.create({
          data: {
            type: "payment",
            refType: "Payment",
            refId: paymentId,
            customerId: s.customer.id,
            amount: paidAmount,
            direction: "credit",
            date,
          },
        });
      }
    });
  }

  // ── Record standalone payments (5, some today) ──────────────────────
  console.log("💵 Recording 5 standalone payments...");
  type PaymentSeed = {
    customer: typeof customers[number];
    amount: number;
    hoursAgo?: number;
    daysAgo?: number;
    hour?: number;
    method: string;
  };
  const payments: PaymentSeed[] = [
    { customer: customers[0]!, amount: 10000, hoursAgo: 1, method: "cash" },
    { customer: customers[2]!, amount: 20000, hoursAgo: 3, method: "bank" },
    { customer: customers[5]!, amount: 30000, daysAgo: 1, hour: 15, method: "cheque" },
    { customer: customers[0]!, amount: 5000,  daysAgo: 2, hour: 12, method: "cash" },
    { customer: customers[3]!, amount: 8000,  daysAgo: 4, hour: 14, method: "easypaisa" },
  ];

  for (const p of payments) {
    const date = p.hoursAgo !== undefined ? hoursAgo(p.hoursAgo) : daysAgo(p.daysAgo ?? 0, p.hour);
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          customerId: p.customer.id,
          amount: p.amount,
          method: p.method,
          date,
        },
      });
      await tx.transaction.create({
        data: {
          type: "payment",
          refType: "Payment",
          refId: payment.id,
          customerId: p.customer.id,
          amount: p.amount,
          direction: "credit",
          date,
        },
      });
    });
  }

  // ── Record expenses (6, some today) ─────────────────────────────────
  console.log("🧾 Recording 6 expenses...");
  const expenses = [
    { name: "Diesel for delivery van", amount: 2500, category: "transport", hoursAgo: 1 },
    { name: "Shop electricity bill",   amount: 4500, category: "electricity", hoursAgo: 5 },
    { name: "Packaging plastic bags",   amount: 1200, category: "packaging",   hoursAgo: 8 },
    { name: "Helper daily wage",        amount: 1500, category: "salary",      daysAgo: 1, hour: 18 },
    { name: "Shop rent (monthly)",      amount: 35000, category: "rent",       daysAgo: 2, hour: 10 },
    { name: "Tea & biscuits for shop",   amount: 350,  category: "shop",       daysAgo: 3, hour: 15 },
  ];

  for (const e of expenses) {
    const date = e.hoursAgo !== undefined ? hoursAgo(e.hoursAgo) : daysAgo(e.daysAgo ?? 0, e.hour);
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          name: e.name,
          amount: e.amount,
          category: e.category,
          date,
        },
      });
      await tx.transaction.create({
        data: {
          type: "expense",
          refType: "Expense",
          refId: expense.id,
          amount: e.amount,
          direction: "debit",
          date,
        },
      });
    });
  }

  // ── Done — print summary ────────────────────────────────────────────
  console.log("\n✅ Sample data seeded successfully!\n");

  const counts = await Promise.all([
    prisma.customer.count(),
    prisma.product.count(),
    prisma.sale.count(),
    prisma.payment.count(),
    prisma.expense.count(),
    prisma.stockMove.count(),
    prisma.transaction.count(),
  ]);

  console.log("📊 Data summary:");
  console.log(`   Customers:    ${counts[0]}`);
  console.log(`   Products:     ${counts[1]}`);
  console.log(`   Sales:        ${counts[2]}`);
  console.log(`   Payments:     ${counts[3]}`);
  console.log(`   Expenses:     ${counts[4]}`);
  console.log(`   Stock moves:  ${counts[5]}`);
  console.log(`   Transactions: ${counts[6]}`);

  // ── Print expected dashboard numbers for verification ───────────────
  console.log("\n🎯 Expected dashboard values:");
  const todaysSales = await prisma.sale.aggregate({
    _sum: { totalAmount: true },
    where: {
      voidedAt: null,
      date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });
  const todaysPayments = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: {
      voidedAt: null,
      date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });
  const todaysExpenses = await prisma.expense.aggregate({
    _sum: { amount: true },
    where: {
      voidedAt: null,
      date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });
  console.log(`   Today's sales:    Rs. ${todaysSales._sum.totalAmount?.toString() ?? "0"}`);
  console.log(`   Today's payments:  Rs. ${todaysPayments._sum.amount?.toString() ?? "0"}`);
  console.log(`   Today's expenses: Rs. ${todaysExpenses._sum.amount?.toString() ?? "0"}`);
  console.log("\n🚀 Run `npm run dev` and visit http://localhost:3000 to see the dashboard.");
}

main()
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
