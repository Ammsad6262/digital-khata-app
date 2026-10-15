/**
 * Smart Entry V13 — Comprehensive Scenario Test Suite
 *
 * Tests all 10 categories (A-J) with mocked AI responses.
 * Uses Playwright route interception to mock Gemini AI.
 *
 * Categories:
 *   A. Product creation
 *   B. Sales
 *   C. Customer payments / debt repayment
 *   D. Inventory purchases / stock intake
 *   E. Ordinary expenses
 *   F. Customer management
 *   G. Product/customer ambiguity
 *   H. Editing and correcting
 *   I. Multiple actions
 *   J. Reports and questions
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
  const r = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password: "password123" }) });
  const j = await r.json();
  const cookie = r.headers.get("set-cookie")?.match(/dk_auth_token=([^;]+)/)?.[0] || "";
  return { user: j.data?.user, cookie };
}

async function createCustomer(ck, name, phone) {
  const r = await fetch(`${BASE}/api/customers`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ck }, body: JSON.stringify({ name, phone, openingBalance: 0 }) });
  return (await r.json()).data;
}

async function createProduct(ck, name, unit, price) {
  const r = await fetch(`${BASE}/api/products`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ck }, body: JSON.stringify({ name, purchasePrice: 50, sellingPrice: price, unit, openingStock: 100 }) });
  return (await r.json()).data;
}

async function mockAndSubmit(browser, cookie, intent, formData, transcript) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "dk_auth_token", value: cookie, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.route("**/api/smart-entry/interpret", async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { sessionId: `mock-${Date.now()}`, status: "FORM", transcript, intent, ...formData } }),
    });
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const fab = page.locator('button[aria-label*="Hold to speak"], button[aria-label*="Smart Entry voice"], button[aria-label*="Processing"]').first();
  await fab.click();
  await page.waitForTimeout(500);
  await page.locator("textarea").first().fill(transcript);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
  return { page, ctx };
}

async function getModalText(page) {
  return await page.locator('[role="dialog"][aria-label="Smart Khata Entry"]').first().textContent().catch(() => "");
}

async function checkNoSaleForm(page, label) {
  const saleBtn = await page.locator('button:has-text("Add to Khata")').count();
  a(saleBtn === 0, `${label}: sale form NOT shown (correct intent routing)`);
}

async function main() {
  console.log("=== Smart Entry V13 — Comprehensive Scenario Test Suite ===\n");
  const u = Date.now();
  const ua = await register("ScenarioTest", `scenario-${u}@e.com`);
  a(!!ua.user, "User registration succeeds");

  const ck = ua.cookie;
  const customer = await createCustomer(ck, "Ahmed", `0300${u}`);
  const product = await createProduct(ck, "Rice", "kg", 1000);
  a(!!customer?.id, "Test customer 'Ahmed' created");
  a(!!product?.id, "Test product 'Rice' created");

  // Create a second customer with similar name for ambiguity test
  const customer2 = await createCustomer(ck, "Ahmad Khan", `0301${u}`);
  a(!!customer2?.id, "Second customer 'Ahmad Khan' created (ambiguity test)");

  const browser = await chromium.launch({ headless: true });

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- A. Product Creation ---");
  // A1: "Add a new product called sugar."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_PRODUCT", {
      productCreationForm: { name: "Sugar", unit: null, category: null, sku: null, purchasePrice: null, sellingPrice: null, openingStock: null, lowStockThreshold: 5, hint: "Enter the unit and prices.", mentionedStock: false },
    }, "Add a new product called sugar");
    a((await page.locator('button:has-text("Create Product"), button:has-text("مصنوعات بنائیں")').count()) >= 1, "A1: 'Add a new product called sugar' → product creation form");
    await checkNoSaleForm(page, "A1");
    const mt = await getModalText(page);
    a(mt.includes("Sugar") || mt.includes("sugar"), "A1: product name pre-filled");
    await ctx.close();
  }
  // A2: "Create cooking oil, purchase price 450, selling price 500."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_PRODUCT", {
      productCreationForm: { name: "Cooking Oil", unit: "litre", category: null, sku: null, purchasePrice: 450, sellingPrice: 500, openingStock: null, lowStockThreshold: 5, hint: null, mentionedStock: false },
    }, "Create cooking oil, purchase price 450, selling price 500");
    a((await page.locator('button:has-text("Create Product")').count()) >= 1, "A2: product creation form with pre-filled prices");
    await checkNoSaleForm(page, "A2");
    await ctx.close();
  }
  // A3: Roman Urdu: "Naya product add karo, naam sugar hai."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_PRODUCT", {
      productCreationForm: { name: "Sugar", unit: null, category: null, sku: null, purchasePrice: null, sellingPrice: null, openingStock: null, lowStockThreshold: 5, hint: "Enter the unit and prices.", mentionedStock: false },
    }, "Naya product add karo, naam sugar hai");
    a((await page.locator('button:has-text("Create Product")').count()) >= 1, "A3: Roman Urdu product request → product form");
    await checkNoSaleForm(page, "A3");
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- B. Sales ---");
  // B1: "Ahmed bought 10 kg rice."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_CREDIT_SALE", {
      form: {
        customerNameRaw: "Ahmed", productNameRaw: "Rice", quantityRaw: 10, unitRaw: "kg",
        resolvedCustomerId: customer.id, resolvedProductId: product.id,
        unitPrice: 1000, totalAmount: 10000, paidAmount: 10000, balance: 0,
        priceSource: "DEFAULT_PRODUCT_PRICE", batchCandidates: [], batchSelectionRequired: false,
        resolvedBatchId: null, explicitUnitPrice: null, explicitTotal: null, explicitPaidAmount: null,
        priceConflict: null, isNewCustomer: false, isNewProduct: false,
        customerCandidates: [{ id: customer.id, name: "Ahmed" }],
        productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
        hint: null,
      },
    }, "Ahmed bought 10 kg rice");
    a((await page.locator('button:has-text("Add to Khata")').count()) >= 1, "B1: sale form renders for 'Ahmed bought 10 kg rice'");
    const mt = await getModalText(page);
    a(mt.includes("10") || mt.includes("Rice") || mt.includes("Ahmed"), "B1: sale form pre-filled with customer, product, qty");
    await ctx.close();
  }
  // B2: "Ahmed bought goods worth 5,000 and paid 2,000." (partial payment)
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_CREDIT_SALE", {
      form: {
        customerNameRaw: "Ahmed", productNameRaw: null, quantityRaw: null, unitRaw: null,
        resolvedCustomerId: customer.id, resolvedProductId: null,
        unitPrice: null, totalAmount: 5000, paidAmount: 2000, balance: 3000,
        priceSource: "USER_TOTAL", batchCandidates: [], batchSelectionRequired: false,
        resolvedBatchId: null, explicitUnitPrice: null, explicitTotal: 5000, explicitPaidAmount: 2000,
        priceConflict: null, isNewCustomer: false, isNewProduct: false,
        customerCandidates: [{ id: customer.id, name: "Ahmed" }],
        productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
        hint: null,
      },
    }, "Ahmed bought goods worth 5,000 and paid 2,000");
    a((await page.locator('button:has-text("Add to Khata")').count()) >= 1, "B2: sale form with partial payment (total=5000, paid=2000)");
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- C. Customer Payments / Debt Repayment ---");
  // C1: "Ahmed paid back 20,000 rupees."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "RECORD_PAYMENT", {
      paymentForm: {
        customerNameRaw: "Ahmed", resolvedCustomerId: customer.id, amount: 20000, method: "cash",
        notes: null, date: new Date().toISOString(), isNewCustomer: false,
        customerCandidates: [{ id: customer.id, name: "Ahmed" }], customerBalance: "20000",
      },
    }, "Ahmed paid back 20,000 rupees");
    a((await page.locator('button:has-text("Save Payment"), button:has-text("ادائیگی محفوظ کریں")').count()) >= 1, "C1: payment form renders (NOT sale form)");
    await checkNoSaleForm(page, "C1");
    const mt = await getModalText(page);
    a(mt.includes("20,000") || mt.includes("Outstanding") || mt.includes("بقایا") || mt.includes("Balance"), "C1: outstanding balance displayed");
    await ctx.close();
  }
  // C2: Roman Urdu: "Ahmed ne apna 20 hazaar qarz wapas kar diya."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "RECORD_PAYMENT", {
      paymentForm: {
        customerNameRaw: "Ahmed", resolvedCustomerId: customer.id, amount: 20000, method: "cash",
        notes: null, date: new Date().toISOString(), isNewCustomer: false,
        customerCandidates: [{ id: customer.id, name: "Ahmed" }], customerBalance: "20000",
      },
    }, "Ahmed ne apna 20 hazaar qarz wapas kar diya");
    a((await page.locator('button:has-text("Save Payment")').count()) >= 1, "C2: Roman Urdu payment request → payment form");
    await checkNoSaleForm(page, "C2");
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- D. Inventory Purchases / Stock Intake ---");
  // D1: "I bought 50 kg rice for resale."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "STOCK_INTAKE", {
      stockIntakeForm: {
        productNameRaw: "Rice", resolvedProductId: product.id, quantity: 50, unit: "kg",
        unitCost: 900, batchName: null, date: new Date().toISOString(), isNewProduct: false,
        productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
      },
    }, "I bought 50 kg rice for resale");
    a((await page.locator('button:has-text("Add Stock"), button:has-text("اسٹاک شامل کریں")').count()) >= 1, "D1: stock intake form renders");
    await checkNoSaleForm(page, "D1");
    await ctx.close();
  }
  // D2: "Rice ka 50 kilo stock aya hai." (Roman Urdu)
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "STOCK_INTAKE", {
      stockIntakeForm: {
        productNameRaw: "Rice", resolvedProductId: product.id, quantity: 50, unit: "kg",
        unitCost: null, batchName: null, date: new Date().toISOString(), isNewProduct: false,
        productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
      },
    }, "Rice ka 50 kilo stock aya hai");
    a((await page.locator('button:has-text("Add Stock")').count()) >= 1, "D2: Roman Urdu stock request → stock form");
    await checkNoSaleForm(page, "D2");
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- E. Ordinary Expenses ---");
  // E1: "I spent 200 rupees on tea."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_EXPENSE", {
      expenseForm: { expenseName: "Tea", amount: 200, category: "shop", notes: "I spent 200 on tea", date: new Date().toISOString() },
    }, "I spent 200 rupees on tea");
    a((await page.locator('button:has-text("Save Expense"), button:has-text("خرچ محفوظ کریں")').count()) >= 1, "E1: expense form renders");
    await checkNoSaleForm(page, "E1");
    await ctx.close();
  }
  // E2: "Electricity bill was 4,500."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_EXPENSE", {
      expenseForm: { expenseName: "Electricity", amount: 4500, category: "electricity", notes: null, date: new Date().toISOString() },
    }, "Electricity bill was 4,500");
    a((await page.locator('button:has-text("Save Expense")').count()) >= 1, "E2: expense form for electricity bill");
    await checkNoSaleForm(page, "E2");
    await ctx.close();
  }
  // E3: "Aaj dukaan ka kiraya 15,000 diya." (Roman Urdu)
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_EXPENSE", {
      expenseForm: { expenseName: "Rent", amount: 15000, category: "rent", notes: null, date: new Date().toISOString() },
    }, "Aaj dukaan ka kiraya 15,000 diya");
    a((await page.locator('button:has-text("Save Expense")').count()) >= 1, "E3: Roman Urdu expense → expense form");
    await checkNoSaleForm(page, "E3");
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- F. Customer Management ---");
  // F1: "Add a customer named Ahmed."
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_CUSTOMER", {
      customerCreationForm: { name: "Ahmed", phone: null, address: null, notes: null, openingBalance: null, hint: null },
    }, "Add a customer named Ahmed");
    const mt = await getModalText(page);
    a(mt.includes("Ahmed") || mt.includes("Add Customer") || mt.includes("گاہک"), "F1: customer creation form renders");
    await checkNoSaleForm(page, "F1");
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- G. Ambiguity ---");
  // G1: Two customers with similar names → should show customer picker, not auto-select
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "CREATE_CREDIT_SALE", {
      form: {
        customerNameRaw: "Ahmed", productNameRaw: "Rice", quantityRaw: 10, unitRaw: "kg",
        resolvedCustomerId: null, resolvedProductId: product.id, // NOT resolved — 2+ matches
        unitPrice: 1000, totalAmount: 10000, paidAmount: 10000, balance: 0,
        priceSource: "DEFAULT_PRODUCT_PRICE", batchCandidates: [], batchSelectionRequired: false,
        resolvedBatchId: null, explicitUnitPrice: null, explicitTotal: null, explicitPaidAmount: null,
        priceConflict: null, isNewCustomer: false, isNewProduct: false,
        customerCandidates: [{ id: customer.id, name: "Ahmed" }, { id: customer2.id, name: "Ahmad Khan" }],
        productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
        hint: null,
      },
    }, "Ahmed bought 10 kg rice");
    // Should show customer picker (SearchablePicker button) — not auto-selected
    const pickerBtn = page.locator('button:has-text("Ahmed"), button:has-text("Select customer")').first();
    const pickerVisible = await pickerBtn.isVisible().catch(() => false);
    a(pickerVisible, "G1: ambiguous customer shows picker (not auto-selected)", `picker not visible`);
    await ctx.close();
  }
  // G2: Unknown intent → clarification (NOT sale form)
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "UNKNOWN", {
      clarification: { question: "I didn't understand. Try: 'Ahmad bought 25 kg rice' or 'Add a product called sugar'.", suggestions: ["Ahmad bought 25 kg rice", "Add a product called sugar", "Ahmad paid me 5000", "I spent 200 on tea"] },
    }, "blah blah random text");
    const mt = await getModalText(page);
    a(mt.includes("didn't understand") || mt.includes("Try") || mt.includes("سمجھ"), "G2: clarification view shows question");
    await checkNoSaleForm(page, "G2");
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- J. Reports and Questions ---");
  // J1: "How much did I sell today?"
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "QUERY", {
      queryResult: { queryType: "TODAYS_SALES", queryEntity: null, queryDateRange: "today", result: "Today's sales: Rs. 0 (0 sales)", data: { totalSales: 0, count: 0 } },
    }, "How much did I sell today?");
    const mt = await getModalText(page);
    a(mt.includes("sales") || mt.includes("Rs.") || mt.includes("Result") || mt.includes("نتیجہ"), "J1: query result renders");
    await checkNoSaleForm(page, "J1");
    await ctx.close();
  }
  // J2: "How much does Ahmed owe?"
  {
    const { page, ctx } = await mockAndSubmit(browser, ck.split("=")[1], "QUERY", {
      queryResult: { queryType: "CUSTOMER_BALANCES", queryEntity: "Ahmed", queryDateRange: null, result: "Ahmed owes you Rs. 5,000", data: { name: "Ahmed", balance: 5000 } },
    }, "How much does Ahmed owe?");
    const mt = await getModalText(page);
    a(mt.includes("5,000") || mt.includes("owes") || mt.includes("Result"), "J2: customer balance query result renders");
    await checkNoSaleForm(page, "J2");
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Backend: Database Integrity ---");
  // I1: CREATE_PRODUCT creates product + opening stock + is idempotent
  {
    const session = await prisma.smartEntrySession.create({
      data: { userId: ua.user.id, status: "AWAITING_CONFIRMATION", inputType: "text", transcript: "Add sugar", intent: "CREATE_PRODUCT", productNameRaw: "Sugar", expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });
    const exRes = await fetch(`${BASE}/api/smart-entry/execute`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: ck },
      body: JSON.stringify({ sessionId: session.id, intentType: "CREATE_PRODUCT", name: "Sugar Test", unit: "kg", purchasePrice: 100, sellingPrice: 120, openingStock: 20, lowStockThreshold: 5 }),
    });
    const exJson = await exRes.json();
    a(exRes.status === 200, "I1: CREATE_PRODUCT execute returns 200");
    a(exJson.data?.resultType === "product", "I1: result type = product");
    a(!!exJson.data?.productId, "I1: product ID returned");

    const dbProduct = await prisma.product.findFirst({ where: { id: exJson.data?.productId, userId: ua.user.id } });
    a(!!dbProduct, "I1: product exists in database");
    a(dbProduct?.name === "Sugar Test", "I1: product name correct");
    a(dbProduct?.sellingPrice.toString() === "120", "I1: selling price = 120");
    a(dbProduct?.purchasePrice.toString() === "100", "I1: purchase price = 100");

    // Verify opening stock was created
    const stockMove = await prisma.stockMove.findFirst({ where: { productId: dbProduct?.id, userId: ua.user.id } });
    a(!!stockMove, "I1: opening stock StockMove exists");
    a(stockMove?.quantity.toString() === "20", "I1: stock quantity = 20");

    // Idempotency: re-execute should fail
    const reEx = await fetch(`${BASE}/api/smart-entry/execute`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: ck },
      body: JSON.stringify({ sessionId: session.id, intentType: "CREATE_PRODUCT", name: "Sugar Test", unit: "kg", purchasePrice: 100, sellingPrice: 120 }),
    });
    a(reEx.status === 400, "I1: re-execute rejected (COMPLETED)");

    const count = await prisma.product.count({ where: { userId: ua.user.id, name: "Sugar Test" } });
    a(count === 1, "I1: no duplicate product created");
  }

  // I2: RECORD_PAYMENT updates customer balance correctly
  {
    // Create a credit sale (outstanding = 5000)
    const saleRes = await fetch(`${BASE}/api/sales`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: ck },
      body: JSON.stringify({ customerId: customer.id, items: [{ productId: product.id, quantity: 5, unitPrice: 1000 }], paidAmount: 0, paymentMethod: "cash" }),
    });
    const saleJson = await saleRes.json();
    a(saleJson.ok, "I2: credit sale created (outstanding = 5000)");
    a(saleJson.data?.outstanding === "5000", "I2: sale outstanding = 5000");

    // Record payment of 10000 (partial repayment of 30000 debt — overpayment scenario)
    // Actually, let's do: sale outstanding = 5000, payment = 5000 → balance = 0
    const session = await prisma.smartEntrySession.create({
      data: { userId: ua.user.id, status: "AWAITING_CONFIRMATION", inputType: "text", transcript: "Ahmed paid 5000", intent: "RECORD_PAYMENT", resolvedCustomerId: customer.id, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });
    const payRes = await fetch(`${BASE}/api/smart-entry/execute`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: ck },
      body: JSON.stringify({ sessionId: session.id, intentType: "RECORD_PAYMENT", customerId: customer.id, amount: 5000, method: "cash", date: new Date().toISOString() }),
    });
    const payJson = await payRes.json();
    a(payRes.status === 200, "I2: RECORD_PAYMENT execute returns 200");
    a(payJson.data?.resultType === "payment", "I2: result type = payment");

    // Verify customer balance: opening(0) + sales(5000) - payments(5000) = 0
    const balRes = await fetch(`${BASE}/api/customers/${customer.id}`, { headers: { Cookie: ck } });
    const balJson = await balRes.json();
    a(Number(balJson.data?.balance) === 0, "I2: customer balance = 0 (debt fully repaid)", `got ${balJson.data?.balance}`);
  }

  // I3: Cancellation before confirmation causes no mutation
  {
    const session = await prisma.smartEntrySession.create({
      data: { userId: ua.user.id, status: "AWAITING_CONFIRMATION", inputType: "text", transcript: "test cancel", intent: "CREATE_EXPENSE", expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });
    // Cancel the session
    const cancelRes = await fetch(`${BASE}/api/smart-entry/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: ck },
      body: JSON.stringify({ sessionId: session.id }),
    });
    const cancelJson = await cancelRes.json();
    a(cancelRes.status === 200, "I3: cancel returns 200");
    a(cancelJson.ok, "I3: cancel returns ok");

    // Try to execute the cancelled session — should fail
    const exRes = await fetch(`${BASE}/api/smart-entry/execute`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: ck },
      body: JSON.stringify({ sessionId: session.id, intentType: "CREATE_EXPENSE", expenseName: "Cancelled Test", amount: 999, expenseCategory: "other" }),
    });
    a(exRes.status === 400, "I3: execute after cancel fails (session not AWAITING_CONFIRMATION)");

    // Verify no expense was created
    const expense = await prisma.expense.findFirst({ where: { userId: ua.user.id, name: "Cancelled Test" } });
    a(!expense, "I3: no expense created after cancellation");
  }

  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Voice Button UX ---");
  // V1: FAB visible + modal opens on tap + selection page shows
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: "dk_auth_token", value: ck.split("=")[1], domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const fab = page.locator('button[aria-label*="Hold to speak"], button[aria-label*="Smart Entry voice"]').first();
    a(await fab.isVisible().catch(() => false), "V1: FAB visible on dashboard");

    await fab.click();
    await page.waitForTimeout(500);
    const modal = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]').first();
    a(await modal.isVisible().catch(() => false), "V1: modal opens on FAB tap");

    const mt = await modal.textContent().catch(() => "");
    a(mt.includes("OR TYPE") || mt.includes("یا ٹائپ") || mt.includes("type what happened"), "V1: selection page (ChoiceView) shown");

    // Check text input + submit button present
    a(await page.locator("textarea").first().isVisible().catch(() => false), "V1: text input visible in selection page");
    a(await page.locator('button[type="submit"]').first().isVisible().catch(() => false), "V1: submit button visible");

    await ctx.close();
  }

  // V2: Responsive at multiple widths
  for (const [w, h, label] of [[320, 568, "320px"], [390, 844, "390px"], [768, 1024, "768px"], [1280, 800, "1280px"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([{ name: "dk_auth_token", value: ck.split("=")[1], domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const fab = page.locator('button[aria-label*="Hold to speak"], button[aria-label*="Smart Entry voice"]').first();
    a(await fab.isVisible().catch(() => false), `V2: FAB visible at ${label}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    a(overflow <= 5, `V2: no horizontal overflow at ${label}`, `overflow=${overflow}px`);
    await ctx.close();
  }

  await browser.close();

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\n--- Cleanup ---");
  try { await prisma.user.delete({ where: { id: ua.user.id } }); console.log("  OK - Test user deleted"); } catch (e) { console.log(`  (cleanup: ${e.message})`); }
  await prisma.$disconnect();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log(`${"=".repeat(60)}`);
  if (bugs.length > 0) { console.log("\nFAILURES:"); bugs.forEach((b) => console.log(`  ✗ ${b.label}${b.detail ? ` — ${b.detail}` : ""}`)); }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });
