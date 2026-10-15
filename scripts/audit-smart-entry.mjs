/**
 * PHASE 1 AUDIT — Real-world Smart Entry functionality test.
 *
 * Tests the ACTUAL backend behavior (not mocked) for every intent type.
 * Verifies what works, what's partial, what's not implemented, and what's broken.
 *
 * Uses the REAL /api/smart-entry/interpret + /api/smart-entry/execute endpoints.
 * The AI (Gemini) is geo-blocked from this server, so /interpret will return
 * a FAILED status with "AI not configured". We work around this by:
 *   1. Testing the execute endpoint directly (bypassing AI) — create a
 *      SmartEntrySession in the DB with the desired intent, then call execute.
 *   2. Testing the UI rendering via Playwright with mocked /interpret responses.
 *
 * This gives us the ACTUAL behavior of the backend + UI for each intent.
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

let pass = 0, fail = 0, partial = 0;
const results = [];
function record(status, label, detail) {
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : status === "PARTIAL" ? "◐" : "?";
  console.log(`  ${icon} [${status}] ${label}${detail ? ` — ${detail}` : ""}`);
  results.push({ status, label, detail });
  if (status === "PASS") pass++;
  else if (status === "FAIL") fail++;
  else if (status === "PARTIAL") partial++;
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
  console.log("=== SMART ENTRY AUDIT — PHASE 1 ===\n");
  const u = Date.now();
  const ua = await register("Audit", `audit-${u}@e.com`);
  record(!!ua.user ? "PASS" : "FAIL", "User registration");

  // Create test customer + product
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

  record(!!customer?.id ? "PASS" : "FAIL", "Test customer created");
  record(!!product?.id ? "PASS" : "FAIL", "Test product created");

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- A. CUSTOMER CREATION (via Smart Entry execute) ---");

  // Test 1: CREATE_CUSTOMER intent — falls through to sale form logic.
  // The service doesn't have a dedicated customer creation path — it relies on
  // the isNewCustomer flag in the sale form. So CREATE_CUSTOMER intent = the
  // user sees the sale form with customerName pre-filled + "New customer detected" banner.
  const custSession = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "Add a customer named Ali",
      intent: "CREATE_CUSTOMER",
      customerNameRaw: "Ali",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  // Try to execute as a sale (the only execute path) — this should fail
  // because there's no productId/quantity
  const custExecRes = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: custSession.id,
      intentType: "CREATE_CREDIT_SALE",
      customerId: "fake-id",
      productId: "fake-id",
      quantity: 1,
    }),
  });
  const custExecJson = await custExecRes.json();
  record(
    custExecRes.status === 404 || !custExecJson.ok ? "PASS" : "FAIL",
    "CREATE_CUSTOMER execute does not create fake records (expected to fail safely)",
    `status=${custExecRes.status}`
  );

  // Test 2: New customer detection in sale flow (isNewCustomer=true)
  // When the AI returns customerName but no matching customer exists,
  // the backend sets isNewCustomer=true in the form. The UI shows a banner
  // with an "Add Customer" button. This is the ACTUAL customer creation path.
  const newCustSession = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "Ali bought 25 kg rice",
      intent: "CREATE_CREDIT_SALE",
      customerNameRaw: "Ali",
      productNameRaw: "Rice",
      quantityRaw: 25,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  // Execute with the REAL customer (Ahmad, not Ali) — simulates user picking existing customer
  const newCustExecRes = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: newCustSession.id,
      intentType: "CREATE_CREDIT_SALE",
      customerId: customer.id,
      productId: product.id,
      quantity: 25,
      unitPrice: 1000,
      paidAmount: 25000,
    }),
  });
  const newCustExecJson = await newCustExecRes.json();
  record(
    newCustExecJson.ok ? "PASS" : "FAIL",
    "Sale with existing customer (executes correctly when user picks existing)",
    newCustExecJson.ok ? `saleId=${newCustExecJson.data?.saleId}` : `error: ${newCustExecJson.error?.message}`
  );

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- B. EXPENSE CREATION (via Smart Entry execute) ---");

  // Test 1: Execute expense via the V10 executeExpenseSession
  const expSession = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "I bought tea for 200 rupees",
      intent: "CREATE_EXPENSE",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const expRes = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: expSession.id,
      intentType: "CREATE_EXPENSE",
      expenseName: "Tea",
      amount: 200,
      expenseCategory: "shop",
      date: new Date().toISOString(),
    }),
  });
  const expJson = await expRes.json();
  record(
    expJson.ok ? "PASS" : "FAIL",
    "Expense creation via Smart Entry (backend)",
    expJson.ok ? `expenseId=${expJson.data?.expenseId}` : `error: ${expJson.error?.message}`
  );

  // Verify expense exists in DB
  if (expJson.ok) {
    const dbExpense = await prisma.expense.findFirst({
      where: { userId: ua.user.id, name: "Tea" },
    });
    record(
      !!dbExpense && dbExpense.amount.toString() === "200" ? "PASS" : "FAIL",
      "Expense exists in DB with correct amount (200)"
    );

    // Verify expense appears in /api/expenses
    const expListRes = await fetch(`${BASE}/api/expenses`, {
      headers: { Cookie: ua.cookie },
    });
    const expList = await expListRes.json();
    const found = expList.data?.some((e) => e.name === "Tea" && e.amount === "200");
    record(found ? "PASS" : "FAIL", "Expense appears in /api/expenses list");
  }

  // Test 2: Idempotent re-execute (no duplicate)
  const reExpRes = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: expSession.id,
      intentType: "CREATE_EXPENSE",
      expenseName: "Tea",
      amount: 200,
      expenseCategory: "shop",
      date: new Date().toISOString(),
    }),
  });
  record(
    !reExpRes.ok ? "PASS" : "FAIL",
    "Re-execute expense rejected (no duplicate)",
    `status=${reExpRes.status}`
  );

  const expCount = await prisma.expense.count({ where: { userId: ua.user.id, name: "Tea" } });
  record(expCount === 1 ? "PASS" : "FAIL", `Only 1 expense in DB (got ${expCount})`);

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- C. PRODUCT CREATION (via Smart Entry) ---");

  // Product creation via Smart Entry uses the AddProductWizard (3-step form).
  // The backend creates the product via /api/products/with-opening-stock.
  // The isNewProduct flag triggers the wizard in the UI.
  // There is NO direct execute path for CREATE_PRODUCT — the wizard creates
  // the product directly via /api/products/with-opening-stock, then the
  // sale form continues with the new product selected.

  // Test: create a product via /api/products/with-opening-stock
  const prodRes = await fetch(`${BASE}/api/products/with-opening-stock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      name: "Tea",
      purchasePrice: 150,
      sellingPrice: 200,
      unit: "kg",
      openingStock: 50,
      lowStockThreshold: 5,
    }),
  });
  const prodJson = await prodRes.json();
  record(
    prodJson.ok ? "PASS" : "FAIL",
    "Product creation via /api/products/with-opening-stock",
    prodJson.ok ? `productId=${prodJson.data?.product?.id}` : `error: ${prodJson.error?.message}`
  );

  if (prodJson.ok) {
    // Verify product exists in DB
    const dbProd = await prisma.product.findFirst({
      where: { userId: ua.user.id, name: "Tea" },
    });
    record(!!dbProd ? "PASS" : "FAIL", "Product exists in DB");
    record(dbProd?.sellingPrice.toString() === "200" ? "PASS" : "FAIL", "Product sellingPrice = 200");
    record(dbProd?.openingStock.toString() === "0" ? "PASS" : "FAIL", "Product.openingStock = 0 (tracked via StockMove)");

    // Verify opening stock StockMove exists
    const stockMove = await prisma.stockMove.findFirst({
      where: { productId: dbProd.id, userId: ua.user.id, batchName: "Opening Stock" },
    });
    record(!!stockMove ? "PASS" : "FAIL", "Opening stock StockMove exists");
    record(stockMove?.quantity.toString() === "50" ? "PASS" : "FAIL", "StockMove quantity = 50");

    // Verify stock count via API
    const stockRes = await fetch(`${BASE}/api/products?withStock=1`, {
      headers: { Cookie: ua.cookie },
    });
    const stockJson = await stockRes.json();
    const teaInStock = stockJson.data?.find((p) => p.name === "Tea");
    record(
      teaInStock?.currentStock === "50" ? "PASS" : "FAIL",
      "Stock count = 50 (via /api/products?withStock=1)",
      `got ${teaInStock?.currentStock}`
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- D. STOCK INTAKE ---");

  // STOCK_INTAKE execute throws "not yet implemented" in the route.
  const stockSession = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "I bought 50 kg rice at 900 per kg",
      intent: "STOCK_INTAKE",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const stockExecRes = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: stockSession.id,
      intentType: "STOCK_INTAKE",
      productId: product.id,
      quantity: 50,
      unitCost: 900,
      batchName: "Test Batch",
    }),
  });
  const stockExecJson = await stockExecRes.json();
  record(
    stockExecJson.ok ? "PASS" : "FAIL",
    "Stock intake via Smart Entry execute",
    stockExecJson.ok ? `result=${stockExecJson.data?.resultType}` : stockExecJson.error?.message
  );

  // Verify the stock move was created
  if (stockExecJson.ok) {
    const stockMove = await prisma.stockMove.findFirst({
      where: { productId: product.id, userId: ua.user.id, batchName: "Test Batch" },
      orderBy: { createdAt: "desc" },
    });
    record(!!stockMove ? "PASS" : "FAIL", "Stock move exists in DB for Smart Entry stock intake");
    record(stockMove?.quantity.toString() === "50" ? "PASS" : "FAIL", "Stock move quantity = 50");
    record(stockMove?.unitCost?.toString() === "900" ? "PASS" : "FAIL", "Stock move unitCost = 900");
  }

  // However, stock intake works via the existing /api/stock/moves endpoint
  const stockMoveRes = await fetch(`${BASE}/api/stock/moves`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      productId: product.id,
      type: "purchase",
      quantity: 50,
      unitCost: 900,
      batchName: "Test Batch",
    }),
  });
  const stockMoveJson = await stockMoveRes.json();
  record(
    stockMoveJson.ok ? "PASS" : "FAIL",
    "Stock intake via /api/stock/moves (existing path)",
    stockMoveJson.ok ? "OK" : stockMoveJson.error?.message
  );

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- E. SALES ---");

  // Find the first eligible batch for the product (required for sale execution)
  const firstBatch = await prisma.stockMove.findFirst({
    where: { productId: product.id, userId: ua.user.id, voidedAt: null, remainingQuantity: { gt: 0 } },
    orderBy: { date: "asc" },
  });
  const batchId = firstBatch?.id;

  // Test sale with default price + full payment
  const saleSession1 = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "Ahmad bought 25 kg rice",
      intent: "CREATE_CREDIT_SALE",
      resolvedCustomerId: customer.id,
      resolvedProductId: product.id,
      quantityRaw: 25,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const saleRes1 = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: saleSession1.id,
      intentType: "CREATE_CREDIT_SALE",
      customerId: customer.id,
      productId: product.id,
      quantity: 25,
      unitPrice: 1000,
      paidAmount: 25000,
      batchId,
    }),
  });
  const saleJson1 = await saleRes1.json();
  record(
    saleJson1.ok ? "PASS" : "FAIL",
    "Sale with default price + full payment (25kg × 1000 = 25000, paid=25000)",
    saleJson1.ok ? `total=${saleJson1.data?.totalAmount}, outstanding=${saleJson1.data?.outstanding}` : saleJson1.error?.message
  );

  if (saleJson1.ok) {
    record(saleJson1.data?.totalAmount === "25000" ? "PASS" : "FAIL", "Sale total = 25000");
    record(saleJson1.data?.outstanding === "0" ? "PASS" : "FAIL", "Sale outstanding = 0 (fully paid)");
  }

  // Test sale with partial payment
  const saleSession2 = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "Ahmad bought 25 kg rice and paid 20000",
      intent: "CREATE_CREDIT_SALE",
      resolvedCustomerId: customer.id,
      resolvedProductId: product.id,
      quantityRaw: 25,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const saleRes2 = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: saleSession2.id,
      intentType: "CREATE_CREDIT_SALE",
      customerId: customer.id,
      productId: product.id,
      quantity: 25,
      unitPrice: 1000,
      paidAmount: 20000,
      batchId,
    }),
  });
  const saleJson2 = await saleRes2.json();
  record(
    saleJson2.ok ? "PASS" : "FAIL",
    "Sale with partial payment (25kg × 1000 = 25000, paid=20000)",
    saleJson2.ok ? `total=${saleJson2.data?.totalAmount}, outstanding=${saleJson2.data?.outstanding}` : saleJson2.error?.message
  );

  if (saleJson2.ok) {
    record(saleJson2.data?.outstanding === "5000" ? "PASS" : "FAIL", "Outstanding = 5000 (25000-20000)");
  }

  // Test sale with explicit different unit price (use small qty + find a batch with remaining stock)
  const availBatch = await prisma.stockMove.findFirst({
    where: { productId: product.id, userId: ua.user.id, voidedAt: null, remainingQuantity: { gt: 0 } },
    orderBy: { date: "asc" },
  });

  const saleSession3 = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "Ahmad bought 5 kg rice at 950 per kg",
      intent: "CREATE_CREDIT_SALE",
      resolvedCustomerId: customer.id,
      resolvedProductId: product.id,
      quantityRaw: 5,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const saleRes3 = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: saleSession3.id,
      intentType: "CREATE_CREDIT_SALE",
      customerId: customer.id,
      productId: product.id,
      quantity: 5,
      unitPrice: 950,
      paidAmount: 4750,
      batchId: availBatch?.id,
    }),
  });
  const saleJson3 = await saleRes3.json();
  record(
    saleJson3.ok ? "PASS" : "FAIL",
    "Sale with explicit unit price 950 (5 × 950 = 4750)",
    saleJson3.ok ? `total=${saleJson3.data?.totalAmount}` : saleJson3.error?.message
  );

  if (saleJson3.ok) {
    record(saleJson3.data?.totalAmount === "4750" ? "PASS" : "FAIL", "Total = 4750 (5 × 950, NOT 5 × 1000)");
  }

  // Verify product default price unchanged
  const dbProdAfter = await prisma.product.findUnique({ where: { id: product.id } });
  record(
    dbProdAfter?.sellingPrice.toString() === "1000" ? "PASS" : "FAIL",
    "Product default sellingPrice unchanged (1000, not 950)"
  );

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- F. CUSTOMER PAYMENTS ---");

  // Execute payment via V10 executePaymentSession
  const paySession = await prisma.smartEntrySession.create({
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
      sessionId: paySession.id,
      intentType: "RECORD_PAYMENT",
      customerId: customer.id,
      amount: 5000,
      method: "cash",
      date: new Date().toISOString(),
    }),
  });
  const payJson = await payRes.json();
  record(
    payJson.ok ? "PASS" : "FAIL",
    "Payment via Smart Entry (Rs. 5000 from Ahmad)",
    payJson.ok ? `paymentId=${payJson.data?.paymentId}` : payJson.error?.message
  );

  if (payJson.ok) {
    // Verify payment in DB
    const dbPay = await prisma.payment.findFirst({
      where: { userId: ua.user.id, customerId: customer.id },
      orderBy: { createdAt: "desc" },
    });
    record(!!dbPay ? "PASS" : "FAIL", "Payment exists in DB");
    record(dbPay?.amount.toString() === "5000" ? "PASS" : "FAIL", "Payment amount = 5000");

    // Verify payment appears in /api/payments
    const payListRes = await fetch(`${BASE}/api/payments`, {
      headers: { Cookie: ua.cookie },
    });
    const payList = await payListRes.json();
    const found = payList.data?.some((p) => p.customerId === customer.id);
    record(found ? "PASS" : "FAIL", "Payment appears in /api/payments list");
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- G. UI RENDERING TEST (via Playwright) ---");

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await ctx.addCookies([{ name: "dk_auth_token", value: ua.cookie.split("=")[1], domain: "localhost", path: "/" }]);

  // Test 1: SALE form renders
  await page.route("**/api/smart-entry/interpret", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          sessionId: "mock-sale",
          status: "FORM",
          transcript: "Ahmad bought 25 kg rice",
          intent: "CREATE_CREDIT_SALE",
          form: {
            customerNameRaw: "Ahmad", productNameRaw: "Rice", quantityRaw: 25, unitRaw: "kg",
            batchNameRaw: null, explicitUnitPrice: null, explicitTotal: null,
            explicitPaidAmount: null, resolvedCustomerId: customer.id, resolvedProductId: product.id,
            resolvedBatchId: null, batchCandidates: [], batchSelectionRequired: false,
            unitPrice: 1000, totalAmount: 25000, priceSource: "DEFAULT_PRODUCT_PRICE",
            paidAmount: 25000,
      batchId, balance: 0, priceConflict: null,
            isNewCustomer: false, isNewProduct: false,
            customerCandidates: [{ id: customer.id, name: "Ahmad", phone: `0300${u}` }],
            productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
            hint: null,
          },
        },
      }),
    });
  });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
  await page.waitForTimeout(500);
  await page.locator("textarea").first().fill("Ahmad bought 25 kg rice");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  const saleFormVisible = await page.locator('button:has-text("Add to Khata")').count();
  record(
    saleFormVisible >= 1 ? "PASS" : "FAIL",
    "UI: Sale form renders for CREATE_CREDIT_SALE"
  );

  // Test 2: EXPENSE form — currently does NOT render (falls through to ChoiceView)
  await page.route("**/api/smart-entry/interpret", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          sessionId: "mock-expense",
          status: "FORM",
          transcript: "I bought tea for 200 rupees",
          intent: "CREATE_EXPENSE",
          expenseForm: {
            expenseName: "Tea", amount: 200, category: "shop",
            notes: "I bought tea for 200 rupees", date: new Date().toISOString(),
          },
        },
      }),
    });
  });

  const seDialog = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  if (await seDialog.count() > 0) {
    await seDialog.locator('[aria-label="Close"]').first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
  await page.waitForTimeout(500);
  await page.locator("textarea").first().fill("I bought tea for 200 rupees");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  const expenseFormVisible = await page.getByText(/expense|Expense Name|Category/i).count();
  record(
    expenseFormVisible >= 1 ? "PASS" : "FAIL",
    "UI: Expense form renders for CREATE_EXPENSE",
    `found ${expenseFormVisible} expense-related elements`
  );

  // Test 3: PAYMENT form — currently does NOT render
  await page.route("**/api/smart-entry/interpret", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          sessionId: "mock-payment",
          status: "FORM",
          transcript: "Ahmad paid me 5000",
          intent: "RECORD_PAYMENT",
          paymentForm: {
            customerNameRaw: "Ahmad", resolvedCustomerId: customer.id,
            amount: 5000, method: "cash", notes: null,
            date: new Date().toISOString(), isNewCustomer: false,
            customerCandidates: [{ id: customer.id, name: "Ahmad", phone: `0300${u}` }],
          },
        },
      }),
    });
  });

  const seDialog2 = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  if (await seDialog2.count() > 0) {
    await seDialog2.locator('[aria-label="Close"]').first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
  await page.waitForTimeout(500);
  await page.locator("textarea").first().fill("Ahmad paid me 5000");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  const paymentFormVisible = await page.getByText(/payment|Payment Amount|Method/i).count();
  record(
    paymentFormVisible >= 1 ? "PASS" : "FAIL",
    "UI: Payment form renders for RECORD_PAYMENT",
    `found ${paymentFormVisible} payment-related elements`
  );

  // Test 4: QUERY result — currently does NOT render
  await page.route("**/api/smart-entry/interpret", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          sessionId: "mock-query",
          status: "FORM",
          transcript: "How much did I spend today?",
          intent: "QUERY",
          queryResult: {
            queryType: "TODAYS_EXPENSES", queryEntity: null,
            queryDateRange: "today", result: "Today's expenses: Rs. 200 (1 expenses)",
            data: { total: "200", count: 1 },
          },
        },
      }),
    });
  });

  const seDialog3 = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  if (await seDialog3.count() > 0) {
    await seDialog3.locator('[aria-label="Close"]').first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
  await page.waitForTimeout(500);
  await page.locator("textarea").first().fill("How much did I spend today?");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  const queryResultVisible = await page.getByText(/Today's expenses|Rs\. 200/i).count();
  record(
    queryResultVisible >= 1 ? "PASS" : "FAIL",
    "UI: Query result renders for QUERY intent",
    `found ${queryResultVisible} query-related elements`
  );

  await browser.close();

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- H. SECURITY ---");

  const ub = await register("Attacker", `attacker-${u}@e.com`);

  // Cross-tenant: User B cannot execute User A's session
  const crossExec = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ub.cookie },
    body: JSON.stringify({
      sessionId: saleSession1.id,
      intentType: "CREATE_CREDIT_SALE",
      customerId: customer.id,
      productId: product.id,
      quantity: 1,
    }),
  });
  record(
    crossExec.status === 404 || !crossExec.ok ? "PASS" : "FAIL",
    "Cross-tenant: User B cannot execute User A's session"
  );

  // Cross-tenant: User B cannot fetch User A's expense
  if (expJson.ok) {
    const crossFetch = await fetch(`${BASE}/api/expenses/${expJson.data?.expenseId}`, {
      headers: { Cookie: ub.cookie },
    });
    record(
      crossFetch.status === 404 ? "PASS" : "FAIL",
      "Cross-tenant: User B cannot fetch User A's expense"
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- I. REAL AI (Gemini) ---");

  // Test if Gemini API key is configured
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  record(
    hasGeminiKey ? "PARTIAL" : "UNTESTED",
    "Gemini AI real interpretation",
    hasGeminiKey ? "Key configured but geo-blocked from this server" : "GEMINI_API_KEY not set"
  );

  // Test /interpret with real text (will fail if AI is geo-blocked)
  const interpretRes = await fetch(`${BASE}/api/smart-entry/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({ text: "Ahmad bought 25 kg rice" }),
  });
  const interpretJson = await interpretRes.json();
  record(
    interpretJson.ok ? "PASS" : interpretJson.data?.status === "FAILED" ? "UNTESTED" : "FAIL",
    "Real /interpret endpoint",
    interpretJson.ok ? `intent=${interpretJson.data?.intent}` : interpretJson.error?.message ?? interpretJson.data?.message
  );

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Cleanup ---");
  await prisma.user.delete({ where: { id: ua.user.id } });
  await prisma.user.delete({ where: { id: ub.user.id } });
  await prisma.$disconnect();
  console.log("  OK - Test users + their data cascade-deleted");

  // ════════════════════════════════════════════════════════════════════════════
  console.log(`\n${"=".repeat(70)}`);
  console.log("  AUDIT SUMMARY");
  console.log(`${"=".repeat(70)}`);
  console.log(`  PASS:          ${pass}`);
  console.log(`  FAIL:          ${fail}`);
  console.log(`  PARTIAL:       ${partial}`);
  console.log(`  UNTESTED:      ${results.filter(r => r.status === "UNTESTED").length}`);
  console.log(`  NOT IMPLEMENTED: ${results.filter(r => r.status === "NOT IMPLEMENTED").length}`);
  console.log(`${"=".repeat(70)}`);

  if (fail > 0) {
    console.log("\nFAILURES:");
    results.filter(r => r.status === "FAIL").forEach(r => console.log(`  ✗ ${r.label}${r.detail ? ` — ${r.detail}` : ""}`));
  }
  if (results.some(r => r.status === "PARTIAL")) {
    console.log("\nPARTIAL:");
    results.filter(r => r.status === "PARTIAL").forEach(r => console.log(`  ◐ ${r.label}${r.detail ? ` — ${r.detail}` : ""}`));
  }
  if (results.some(r => r.status === "NOT IMPLEMENTED")) {
    console.log("\nNOT IMPLEMENTED:");
    results.filter(r => r.status === "NOT IMPLEMENTED").forEach(r => console.log(`  ? ${r.label}${r.detail ? ` — ${r.detail}` : ""}`));
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
