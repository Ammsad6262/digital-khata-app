/**
 * Smart Entry V10 — Multi-Intent Test
 *
 * Tests the new multi-intent detection and routing:
 *   - CREATE_EXPENSE: "I bought tea for 200 rupees"
 *   - RECORD_PAYMENT: "Ahmad paid me 5000"
 *   - QUERY: "How much did I spend today?"
 *   - CREATE_CREDIT_SALE: "Ahmad bought 25 kg rice" (existing, still works)
 *
 * Uses Playwright route interception to mock Gemini AI responses.
 */

import { chromium } from "playwright";
import { readFileSync } from "fs";
const envFile = readFileSync("/home/z/my-project/digital-khata-app/.env", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const BASE = "http://localhost:3000";

let pass = 0, fail = 0;
const bugs = [];
function a(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; bugs.push({ label, detail }); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function register(name, email) {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "password123" }),
  });
  const j = await r.json();
  const cookie = r.headers.get("set-cookie")?.match(/dk_auth_token=([^;]+)/)?.[0] || "";
  return { user: j.data?.user, cookie };
}

async function main() {
  console.log("=== Smart Entry V10 — Multi-Intent Test ===\n");
  const u = Date.now();
  const ua = await register("V10Test", `v10-${u}@e.com`);
  a(!!ua.user, "User registers");

  // Create customer + product
  const cc = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({ name: "Ahmad", phone: `0300${u}`, openingBalance: 0 }),
  });
  const customer = (await cc.json()).data;

  const cp = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({ name: "Rice", purchasePrice: 800, sellingPrice: 1000, unit: "kg", openingStock: 100 }),
  });
  const product = (await cp.json()).data;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await ctx.addCookies([{ name: "dk_auth_token", value: ua.cookie.split("=")[1], domain: "localhost", path: "/" }]);

  // Helper: mock /api/smart-entry/interpret with a custom intent
  async function mockInterpret(intent, extraFields = {}) {
    await page.unroute("**/api/smart-entry/interpret");
    await page.route("**/api/smart-entry/interpret", async (route) => {
      const mockResponse = {
        ok: true,
        data: {
          sessionId: `mock-${Date.now()}`,
          status: "FORM",
          transcript: extraFields.transcript ?? "test",
          intent,
          ...extraFields,
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockResponse),
      });
    });
  }

  // Helper: open Smart Entry + submit text
  async function submitText(text) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
    await page.waitForTimeout(500);
    await page.locator("textarea").first().fill(text);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 1. CREATE_EXPENSE intent — 'I bought tea for 200 rupees' ---");
  await mockInterpret("CREATE_EXPENSE", {
    transcript: "I bought tea for 200 rupees",
    expenseForm: {
      expenseName: "Tea",
      amount: 200,
      category: "shop",
      notes: "I bought tea for 200 rupees",
      date: new Date().toISOString(),
    },
  });
  await submitText("I bought tea for 200 rupees");

  // Check that the expense form renders (look for expense-related fields)
  const expenseNameField = await page.locator('input').filter({ hasText: "" }).count();
  // Check for "Expense" or "Amount" text in the modal
  const expenseText = await page.getByText(/expense|Amount|Category/i).count();
  a(expenseText >= 1, "Expense form rendered with expense-related fields");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 2. RECORD_PAYMENT intent — 'Ahmad paid me 5000' ---");
  // Close + reopen
  const seDialog = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  if (await seDialog.count() > 0) {
    await seDialog.locator('[aria-label="Close"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  await mockInterpret("RECORD_PAYMENT", {
    transcript: "Ahmad paid me 5000",
    paymentForm: {
      customerNameRaw: "Ahmad",
      resolvedCustomerId: customer.id,
      amount: 5000,
      method: "cash",
      notes: null,
      date: new Date().toISOString(),
      isNewCustomer: false,
      customerCandidates: [{ id: customer.id, name: "Ahmad", phone: `0300${u}` }],
    },
  });
  await submitText("Ahmad paid me 5000");

  const paymentText = await page.getByText(/payment|Payment|Amount|Received/i).count();
  a(paymentText >= 1, "Payment form rendered with payment-related fields");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 3. QUERY intent — 'How much did I spend today?' ---");
  const seDialog2 = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  if (await seDialog2.count() > 0) {
    await seDialog2.locator('[aria-label="Close"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  await mockInterpret("QUERY", {
    transcript: "How much did I spend today?",
    queryResult: {
      queryType: "TODAYS_EXPENSES",
      queryEntity: null,
      queryDateRange: "today",
      result: "Today's expenses: Rs. 0 (0 expenses)",
      data: { total: "0", count: 0 },
    },
  });
  await submitText("How much did I spend today?");

  // Check that a query result is displayed
  const queryResultText = await page.getByText(/Today's expenses|Rs\. 0/i).count();
  a(queryResultText >= 1, "Query result rendered showing today's expenses");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 4. CREATE_CREDIT_SALE still works — 'Ahmad bought 25 kg rice' ---");
  const seDialog3 = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  if (await seDialog3.count() > 0) {
    await seDialog3.locator('[aria-label="Close"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  await mockInterpret("CREATE_CREDIT_SALE", {
    transcript: "Ahmad bought 25 kg rice",
    form: {
      customerNameRaw: "Ahmad",
      productNameRaw: "Rice",
      quantityRaw: 25,
      unitRaw: "kg",
      batchNameRaw: null,
      explicitUnitPrice: null,
      explicitTotal: null,
      explicitPaidAmount: null,
      resolvedCustomerId: customer.id,
      resolvedProductId: product.id,
      resolvedBatchId: null,
      batchCandidates: [],
      batchSelectionRequired: false,
      unitPrice: 1000,
      totalAmount: 25000,
      priceSource: "DEFAULT_PRODUCT_PRICE",
      paidAmount: 25000,
      balance: 0,
      priceConflict: null,
      isNewCustomer: false,
      isNewProduct: false,
      customerCandidates: [{ id: customer.id, name: "Ahmad", phone: `0300${u}` }],
      productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
      hint: null,
    },
  });
  await submitText("Ahmad bought 25 kg rice");

  // Check that the sale form renders (Add to Khata button)
  const saleForm = await page.locator('button:has-text("Add to Khata")').count();
  a(saleForm >= 1, "Sale form still renders for CREATE_CREDIT_SALE intent");

  await browser.close();

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 5. Backend: execute expense via API ---");
  // Create a SmartEntrySession + execute as expense
  const session = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "I bought tea for 200",
      intent: "CREATE_EXPENSE",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const exRes = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: session.id,
      intentType: "CREATE_EXPENSE",
      expenseName: "Tea",
      amount: 200,
      expenseCategory: "shop",
      notes: "I bought tea for 200",
      date: new Date().toISOString(),
    }),
  });
  const exJson = await exRes.json();
  a(exJson.ok, "Execute expense returns ok");
  a(exJson.data?.resultType === "expense", "Result type = expense");
  a(!!exJson.data?.expenseId, "Expense ID returned");

  // Verify the expense exists in the DB
  const dbExpense = await prisma.expense.findFirst({
    where: { userId: ua.user.id, name: "Tea" },
  });
  a(!!dbExpense, "Expense exists in database");
  a(dbExpense?.amount.toString() === "200", "Expense amount = 200");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 6. Backend: execute payment via API ---");
  const session2 = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "Ahmad paid me 5000",
      intent: "RECORD_PAYMENT",
      resolvedCustomerId: customer.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const payRes = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: session2.id,
      intentType: "RECORD_PAYMENT",
      customerId: customer.id,
      amount: 5000,
      method: "cash",
      date: new Date().toISOString(),
    }),
  });
  const payJson = await payRes.json();
  a(payJson.ok, "Execute payment returns ok");
  a(payJson.data?.resultType === "payment", "Result type = payment");
  a(!!payJson.data?.paymentId, "Payment ID returned");

  // Verify the payment exists in the DB
  const dbPayment = await prisma.payment.findFirst({
    where: { userId: ua.user.id, customerId: customer.id },
  });
  a(!!dbPayment, "Payment exists in database");
  a(dbPayment?.amount.toString() === "5000", "Payment amount = 5000");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 7. Idempotent expense execution (no duplicate) ---");
  const reEx = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: session.id,
      intentType: "CREATE_EXPENSE",
      expenseName: "Tea",
      amount: 200,
      expenseCategory: "shop",
      date: new Date().toISOString(),
    }),
  });
  a(reEx.status === 400, "Re-execute expense rejected (session already COMPLETED)");

  // Verify no duplicate expense
  const expenseCount = await prisma.expense.count({
    where: { userId: ua.user.id, name: "Tea" },
  });
  a(expenseCount === 1, "Only 1 expense in DB (no duplicate)");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 8. Cross-tenant isolation ---");
  const ub = await register("V10B", `v10b-${u}@e.com`);
  const crossFetch = await fetch(`${BASE}/api/expenses/${exJson.data?.expenseId}`, {
    headers: { Cookie: ub.cookie },
  });
  a(crossFetch.status === 404, "User B cannot fetch User A's expense (404)");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- Cleanup ---");
  await prisma.user.delete({ where: { id: ua.user.id } });
  await prisma.user.delete({ where: { id: ub.user.id } });
  await prisma.$disconnect();
  console.log("  OK - Test users + their data cascade-deleted");

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log(`${"=".repeat(60)}`);
  if (bugs.length > 0) {
    console.log("\nFAILURES:");
    bugs.forEach((b) => console.log(`  ✗ ${b.label}${b.detail ? ` — ${b.detail}` : ""}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
