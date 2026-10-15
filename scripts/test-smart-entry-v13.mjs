/**
 * Smart Entry V13 — Comprehensive E2E Test
 *
 * Tests all 10 scenarios using mocked AI responses (Gemini is geo-blocked).
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

async function main() {
  console.log("=== Smart Entry V13 — Comprehensive E2E Test ===\n");
  const u = Date.now();
  const ua = await register("V13Test", `v13-${u}@e.com`);
  a(!!ua.user, "User registration succeeds");

  const customer = await createCustomer(ua.cookie, "Ahmad", `0300${u}`);
  const product = await createProduct(ua.cookie, "Rice", "kg", 1000);
  a(!!customer?.id, "Test customer created");
  a(!!product?.id, "Test product created");

  const browser = await chromium.launch({ headless: true });

  // ── A. Click Dashboard voice button → selection page opens ────────────────
  console.log("\n--- A. Click Dashboard voice button → selection page opens ---");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: "dk_auth_token", value: ua.cookie.split("=")[1], domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const fab = page.locator('button[aria-label*="Hold to speak"], button[aria-label*="Smart Entry voice"], button[aria-label*="Processing"]').first();
    const fabVisible = await fab.isVisible().catch(() => false);
    a(fabVisible, "Smart Entry FAB visible on Dashboard");

    if (fabVisible) {
      await fab.click();
      await page.waitForTimeout(800);
      const modal = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]').first();
      a(await modal.isVisible().catch(() => false), "Modal opens on FAB tap");
      const text = await modal.textContent();
      a(text?.includes("OR TYPE") || text?.includes("type what happened"), "ChoiceView shown with text input");
    }
    await ctx.close();
  }

  // ── Helper: mock interpret + submit text ──────────────────────────────────
  async function mockAndSubmit(ctxCookie, intent, formData, transcript) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: "dk_auth_token", value: ctxCookie, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.route("**/api/smart-entry/interpret", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { sessionId: `mock-${Date.now()}`, status: "FORM", transcript, intent, ...formData } }) });
    });
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.locator('button[aria-label*="Hold to speak"], button[aria-label*="Smart Entry voice"]').first().click();
    await page.waitForTimeout(500);
    await page.locator("textarea").first().fill(transcript);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    return { page, ctx };
  }

  // ── B. Sale: "Ahmad bought 25 kg rice" → sale form ───────────────────────
  console.log("\n--- B. Sale: 'Ahmad bought 25 kg rice' → sale form ---");
  {
    const { page, ctx } = await mockAndSubmit(ua.cookie.split("=")[1], "CREATE_CREDIT_SALE", {
      form: { customerNameRaw: "Ahmad", productNameRaw: "Rice", quantityRaw: 25, unitRaw: "kg", resolvedCustomerId: customer.id, resolvedProductId: product.id, unitPrice: 1000, totalAmount: 25000, paidAmount: 25000, balance: 0, priceSource: "DEFAULT_PRODUCT_PRICE", batchCandidates: [], batchSelectionRequired: false, resolvedBatchId: null, explicitUnitPrice: null, explicitTotal: null, explicitPaidAmount: null, priceConflict: null, isNewCustomer: false, isNewProduct: false, customerCandidates: [{ id: customer.id, name: "Ahmad" }], productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }], hint: null },
    }, "Ahmad bought 25 kg rice");
    const saleBtn = await page.locator('button:has-text("Add to Khata")').count();
    a(saleBtn >= 1, "Sale form renders (Add to Khata button)");
    a((await page.locator('button:has-text("Save Expense"), button:has-text("Save Payment"), button:has-text("Create Product")').count()) === 0, "Other intent forms NOT shown");
    await ctx.close();
  }

  // ── D. "Add a product called cooking oil" → product form ────────────────
  console.log("\n--- D. 'Add a product called cooking oil' → product form ---");
  {
    const { page, ctx } = await mockAndSubmit(ua.cookie.split("=")[1], "CREATE_PRODUCT", {
      productCreationForm: { name: "Cooking Oil", unit: null, category: null, sku: null, purchasePrice: null, sellingPrice: null, openingStock: null, lowStockThreshold: 5, hint: "Enter the unit and prices.", mentionedStock: false },
    }, "Add a product called cooking oil");
    const createBtn = await page.locator('button:has-text("Create Product")').count();
    a(createBtn >= 1, "Product creation form renders (Create Product button)");
    a((await page.locator('button:has-text("Add to Khata")').count()) === 0, "Sale form NOT shown for CREATE_PRODUCT");
    await ctx.close();
  }

  // ── E. "Ahmed paid back Rs. 20,000" → payment form ────────────────────────
  console.log("\n--- E. 'Ahmed paid back Rs. 20,000' → payment form ---");
  {
    const { page, ctx } = await mockAndSubmit(ua.cookie.split("=")[1], "RECORD_PAYMENT", {
      paymentForm: { customerNameRaw: "Ahmad", resolvedCustomerId: customer.id, amount: 20000, method: "cash", notes: null, date: new Date().toISOString(), isNewCustomer: false, customerCandidates: [{ id: customer.id, name: "Ahmad" }], customerBalance: "20000" },
    }, "Ahmed paid back Rs. 20,000");
    const saveBtn = await page.locator('button:has-text("Save Payment")').count();
    a(saveBtn >= 1, "Payment form renders (Save Payment button)");
    a((await page.locator('button:has-text("Add to Khata")').count()) === 0, "Sale form NOT shown for RECORD_PAYMENT");
    // Check outstanding balance display
    const modalText = await page.locator('[role="dialog"]').first().textContent();
    a(modalText?.includes("20,000") || modalText?.includes("Outstanding") || modalText?.includes("Balance"), "Outstanding balance displayed");
    await ctx.close();
  }

  // ── F1. Expense: "I spent 200 on tea" → expense form ──────────────────────
  console.log("\n--- F1. 'I spent 200 on tea' → expense form ---");
  {
    const { page, ctx } = await mockAndSubmit(ua.cookie.split("=")[1], "CREATE_EXPENSE", {
      expenseForm: { expenseName: "Tea", amount: 200, category: "shop", notes: "I spent 200 on tea", date: new Date().toISOString() },
    }, "I spent 200 on tea");
    a((await page.locator('button:has-text("Save Expense")').count()) >= 1, "Expense form renders");
    a((await page.locator('button:has-text("Add to Khata")').count()) === 0, "Sale form NOT shown for CREATE_EXPENSE");
    await ctx.close();
  }

  // ── F2. Stock intake: "I bought 50 kg rice at 900 per kg" ─────────────────
  console.log("\n--- F2. 'I bought 50 kg rice at 900 per kg' → stock form ---");
  {
    const { page, ctx } = await mockAndSubmit(ua.cookie.split("=")[1], "STOCK_INTAKE", {
      stockIntakeForm: { productNameRaw: "Rice", resolvedProductId: product.id, quantity: 50, unit: "kg", unitCost: 900, batchName: null, date: new Date().toISOString(), isNewProduct: false, productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }] },
    }, "I bought 50 kg rice at 900 per kg");
    a((await page.locator('button:has-text("Add Stock")').count()) >= 1, "Stock intake form renders");
    a((await page.locator('button:has-text("Add to Khata")').count()) === 0, "Sale form NOT shown for STOCK_INTAKE");
    await ctx.close();
  }

  // ── F3. New customer: "Add a customer named Ali" ──────────────────────────
  console.log("\n--- F3. 'Add a customer named Ali' → customer form ---");
  {
    const { page, ctx } = await mockAndSubmit(ua.cookie.split("=")[1], "CREATE_CUSTOMER", {
      customerCreationForm: { name: "Ali", phone: null, address: null, notes: null, openingBalance: null, hint: null },
    }, "Add a customer named Ali");
    const modalText = await page.locator('[role="dialog"]').first().textContent();
    a(modalText?.includes("Ali") || modalText?.includes("Add Customer"), "Customer creation form renders");
    a((await page.locator('button:has-text("Add to Khata")').count()) === 0, "Sale form NOT shown for CREATE_CUSTOMER");
    await ctx.close();
  }

  // ── G. Unknown intent → clarification (NOT sale form) ─────────────────────
  console.log("\n--- G. Unknown intent → clarification ---");
  {
    const { page, ctx } = await mockAndSubmit(ua.cookie.split("=")[1], "UNKNOWN", {
      clarification: { question: "I didn't understand. Try: 'Ahmad bought 25 kg rice'", suggestions: ["Ahmad bought 25 kg rice", "Add a product called sugar"] },
    }, "blah blah random text");
    const modalText = await page.locator('[role="dialog"]').first().textContent();
    a(modalText?.includes("didn't understand") || modalText?.includes("Try"), "Clarification view shows question");
    a((await page.locator('button:has-text("Add to Khata")').count()) === 0, "Sale form NOT shown for UNKNOWN");
    await ctx.close();
  }

  // ── I. Backend: execute CREATE_PRODUCT ────────────────────────────────────
  console.log("\n--- I. Backend: execute CREATE_PRODUCT via API ---");
  {
    const session = await prisma.smartEntrySession.create({ data: { userId: ua.user.id, status: "AWAITING_CONFIRMATION", inputType: "text", transcript: "Add cooking oil", intent: "CREATE_PRODUCT", productNameRaw: "Cooking Oil", expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    const exRes = await fetch(`${BASE}/api/smart-entry/execute`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ua.cookie }, body: JSON.stringify({ sessionId: session.id, intentType: "CREATE_PRODUCT", name: "Cooking Oil Test", unit: "litre", purchasePrice: 500, sellingPrice: 600, openingStock: 20, lowStockThreshold: 5 }) });
    const exJson = await exRes.json();
    a(exRes.status === 200, "Execute CREATE_PRODUCT returns 200", `got ${exRes.status}`);
    a(exJson.ok, "Execute returns ok");
    a(exJson.data?.resultType === "product", "Result type = product");
    a(!!exJson.data?.productId, "Product ID returned");

    const dbProduct = await prisma.product.findFirst({ where: { id: exJson.data?.productId, userId: ua.user.id } });
    a(!!dbProduct, "Product exists in database");
    a(dbProduct?.name === "Cooking Oil Test", "Product name correct");
    a(dbProduct?.sellingPrice.toString() === "600", "Selling price = 600");

    // Idempotency: re-execute should fail
    const reEx = await fetch(`${BASE}/api/smart-entry/execute`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ua.cookie }, body: JSON.stringify({ sessionId: session.id, intentType: "CREATE_PRODUCT", name: "Cooking Oil Test", unit: "litre", purchasePrice: 500, sellingPrice: 600 }) });
    a(reEx.status === 400, "Re-execute rejected (COMPLETED)");

    const count = await prisma.product.count({ where: { userId: ua.user.id, name: "Cooking Oil Test" } });
    a(count === 1, "No duplicate product");
  }

  // ── I2. Backend: execute RECORD_PAYMENT — balance updates ────────────────
  console.log("\n--- I2. Backend: execute RECORD_PAYMENT — balance updates ---");
  {
    // Create a credit sale (outstanding = 5000)
    const saleRes = await fetch(`${BASE}/api/sales`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ua.cookie }, body: JSON.stringify({ customerId: customer.id, items: [{ productId: product.id, quantity: 5, unitPrice: 1000 }], paidAmount: 0, paymentMethod: "cash" }) });
    const saleJson = await saleRes.json();
    a(saleJson.ok, "Credit sale created");
    a(saleJson.data?.outstanding === "5000", "Sale outstanding = 5000");

    // Record payment of 20000
    const session = await prisma.smartEntrySession.create({ data: { userId: ua.user.id, status: "AWAITING_CONFIRMATION", inputType: "text", transcript: "Ahmad paid 20000", intent: "RECORD_PAYMENT", resolvedCustomerId: customer.id, expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    const payRes = await fetch(`${BASE}/api/smart-entry/execute`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ua.cookie }, body: JSON.stringify({ sessionId: session.id, intentType: "RECORD_PAYMENT", customerId: customer.id, amount: 20000, method: "cash", date: new Date().toISOString() }) });
    const payJson = await payRes.json();
    a(payRes.status === 200, "Execute RECORD_PAYMENT returns 200");
    a(payJson.data?.resultType === "payment", "Result type = payment");

    const dbPayment = await prisma.payment.findFirst({ where: { userId: ua.user.id, customerId: customer.id, amount: 20000 } });
    a(!!dbPayment, "Payment exists in database");
    a(dbPayment?.amount.toString() === "20000", "Payment amount = 20000");

    // Balance: opening(0) + sales(5000) - payments(20000) = -15000 (advance)
    const balRes = await fetch(`${BASE}/api/customers/${customer.id}`, { headers: { Cookie: ua.cookie } });
    const balJson = await balRes.json();
    a(Number(balJson.data?.balance) === -15000, "Customer balance = -15000 (advance)", `got ${balJson.data?.balance}`);
  }

  // ── J. Responsive ──────────────────────────────────────────────────────────
  console.log("\n--- J. Responsive (mobile + desktop) ---");
  for (const [w, h, label] of [[320, 568, "320px"], [390, 844, "390px"], [1280, 800, "1280px"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([{ name: "dk_auth_token", value: ua.cookie.split("=")[1], domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const fab = page.locator('button[aria-label*="Hold to speak"], button[aria-label*="Smart Entry voice"]').first();
    a(await fab.isVisible().catch(() => false), `FAB visible at ${label}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    a(overflow <= 5, `No horizontal overflow at ${label}`, `overflow=${overflow}px`);
    await ctx.close();
  }

  await browser.close();

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\n--- Cleanup ---");
  try { await prisma.user.delete({ where: { id: ua.user.id } }); console.log("  OK - Test user deleted"); } catch (e) { console.log(`  (cleanup: ${e.message})`); }
  await prisma.$disconnect();

  console.log(`\n${"=".repeat(60)}\n  RESULT: ${pass} passed, ${fail} failed\n${"=".repeat(60)}`);
  if (bugs.length > 0) { console.log("\nFAILURES:"); bugs.forEach((b) => console.log(`  ✗ ${b.label}${b.detail ? ` — ${b.detail}` : ""}`)); }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });
